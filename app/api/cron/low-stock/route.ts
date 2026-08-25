import { and, eq, lte, ne, sql } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { requireCronAuth } from '@/lib/cron/auth'
import { runChunked } from '@/lib/cron/fanout'
import { CRON_JOBS } from '@/lib/cron/health'
import { recordCronRun } from '@/lib/cron/heartbeat'
import { belgradeToday } from '@/lib/dates'
import { db, profiles, supply } from '@/lib/db'
import { sendLowStockEmail } from '@/lib/email/send'
import { EVENTS, logError, logInfo } from '@/lib/observability/log'
import { filterNotifiedSince } from '@/lib/push/dedup'
import { LOW_STOCK_MAX_ALERTS_PER_EPISODE, LOW_STOCK_THRESHOLD } from '@/lib/protocol/dosing'
import { sendPushToUser } from '@/lib/push/send'

export const runtime = 'nodejs'

/** Isti razlog kao u dispatcher-u: batch posao ne sme da se seče na default 10 s. */
export const maxDuration = 60

/** Ne šalji ponovo low-stock alert ako je već poslat u zadnjih ovoliko dana (po kanalu). */
const DEDUP_DAYS = 3

/**
 * Vercel Cron — pronalazi korisnike sa niskim zalihama i šalje alert na EMAIL + PUSH.
 * Zaštićen `CRON_SECRET`-om (Vercel Cron šalje `Authorization: Bearer <secret>`).
 * Vidi vercel.json za raspored.
 *
 * Tri nezavisna ograničenja, i svako radi drugi posao (V10):
 *  1. **Dedup po kanalu, 3 dana** — koliko ČESTO alert sme da izađe. Email i push
 *     imaju svaki svoj prozor, pa poslat mejl ne guta push.
 *  2. **Dnevna rezervacija** (`dedup: { day }`) — atomarna zaštita od dva
 *     preklapajuća run-a; bez nje su oba prošla pred-filter i oba poslala.
 *  3. **Cap po epizodi** (`supply.low_stock_alerts_sent`) — koliko UKUPNO alerta
 *     sme da izađe dok se zalihe ne dopune. Ovo dedup ne može: on ograničava
 *     učestalost, pa je korisnik koji mesec dana ne dokupi dobijao ~10 istih
 *     mejlova. Brojač se resetuje čim zalihe pređu prag.
 *
 * Uz to, `profiles.email_alerts` gasi mejl kanal po korisniku (opt-out iz
 * Podešavanja ili iz `List-Unsubscribe` u samom mejlu); push ostaje netaknut.
 *
 * Kao i dispatcher: obrada ide u grupama sa `Promise.allSettled`, pa jedan pad
 * (npr. Resend vrati 500 za jednog korisnika) ne obara ceo batch, i svaki run
 * ostavlja heartbeat u `cron_runs`.
 */

type ChannelStats = {
  sent: number
  failed: number
  /** Već obavešten u prozoru od `DEDUP_DAYS` dana. */
  skippedDedup: number
  /** Push samo: korisnik nema pretplatu. */
  skippedNoSubscription: number
  /** Email samo: korisnik je isključio alert mejlove. */
  skippedOptOut: number
}

type UserOutcome = {
  email: 'sent' | 'failed' | 'skipped_dedup' | 'skipped_opt_out'
  push: 'sent' | 'failed' | 'skipped_dedup' | 'no_subscription'
}

function emptyChannel(): ChannelStats {
  return { sent: 0, failed: 0, skippedDedup: 0, skippedNoSubscription: 0, skippedOptOut: 0 }
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const startedAt = Date.now()
  const today = belgradeToday()

  // Kandidati: niske zalihe + aktivan pristup (ne 'inactive').
  // `lowStockAlertsSent` i `emailAlerts` se čitaju ovde da bi se cap i opt-out
  // videli u brojačima; oba se svejedno PONOVO proveravaju na mestu slanja —
  // ovo je pred-filter, ne garancija (isti obrazac kao `filterNotifiedSince`).
  const lowStock = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      name: profiles.name,
      emailAlerts: profiles.emailAlerts,
      capsulesRemaining: supply.capsulesRemaining,
      estimatedRunoutDate: supply.estimatedRunoutDate,
      alertsSent: supply.lowStockAlertsSent,
    })
    .from(supply)
    .innerJoin(profiles, eq(profiles.id, supply.userId))
    .where(
      and(lte(supply.capsulesRemaining, LOW_STOCK_THRESHOLD), ne(profiles.accessStatus, 'inactive')),
    )

  // Epizoda je potrošila svoje pokušaje — ćuti dok se zalihe ne dopune.
  const candidates = lowStock.filter((c) => c.alertsSent < LOW_STOCK_MAX_ALERTS_PER_EPISODE)
  const cappedOut = lowStock.length - candidates.length
  if (cappedOut > 0) {
    logInfo(EVENTS.lowStockCapped, {
      users: cappedOut,
      maxPerEpisode: LOW_STOCK_MAX_ALERTS_PER_EPISODE,
    })
  }

  const emailStats = emptyChannel()
  const pushStats = emptyChannel()

  if (candidates.length > 0) {
    const ids = candidates.map((c) => c.id)
    const cutoff = new Date(Date.now() - DEDUP_DAYS * 24 * 60 * 60 * 1000)

    // Nezavistan dedup po kanalu — inače bi poslat email blokirao push (i obrnuto).
    const [emailedRecently, pushedRecently] = await Promise.all([
      filterNotifiedSince({ userIds: ids, type: 'low_stock_alert', since: cutoff, channel: 'email' }),
      filterNotifiedSince({ userIds: ids, type: 'low_stock_alert', since: cutoff, channel: 'push' }),
    ])

    const outcomes = await runChunked<(typeof candidates)[number], UserOutcome>(
      candidates,
      async (c) => {
        // Dva kanala jednog korisnika idu paralelno: nezavisni su i po dedup-u i
        // po servisu, pa nema razloga da push čeka Resend.
        const [emailOut, pushOut] = await Promise.all([
          (async (): Promise<UserOutcome['email']> => {
            if (!c.emailAlerts) return 'skipped_opt_out'
            if (emailedRecently.has(c.id)) return 'skipped_dedup'
            const res = await sendLowStockEmail(
              { id: c.id, email: c.email, name: c.name },
              { capsulesRemaining: c.capsulesRemaining, estimatedRunoutDate: c.estimatedRunoutDate },
              // Rezervacija je po DANU, a prozor dedup-a je 3 dana: dnevni slot
              // sprečava duplikat iz dva preklapajuća run-a, a `emailedRecently`
              // iznad i dalje drži trodnevnu tišinu. Dve različite uloge, oba treba.
              { dedup: { day: today } },
            )
            if (res.skippedOptOut) return 'skipped_opt_out'
            if (res.skippedDedup) return 'skipped_dedup'
            return res.ok ? 'sent' : 'failed'
          })(),
          (async (): Promise<UserOutcome['push']> => {
            if (pushedRecently.has(c.id)) return 'skipped_dedup'
            const res = await sendPushToUser({
              userId: c.id,
              type: 'low_stock_alert',
              title: `Zalihe su pri kraju — ostalo ${c.capsulesRemaining} kapsula`,
              body: 'Dopuni zalihe da ne prekineš protokol.',
              url: '/zalihe',
              tag: 'low_stock_alert',
              dedup: { day: today },
            })
            if (res.skippedDedup) return 'skipped_dedup'
            if (res.sent > 0) return 'sent'
            return res.failures.length > 0 ? 'failed' : 'no_subscription'
          })(),
        ])

        // Brojač epizode raste kad je alert STVARNO izašao bar jednim kanalom.
        // Cap broji ISPORUČENE poruke, ne pokušaje: run u kom je Resend pao ili je
        // dedup preskočio korisnika ne sme da mu pojede jedan od tri pokušaja.
        // Delta ide u SQL-u nad tekućom vrednošću (nikad nad ranije pročitanom),
        // isti obrazac kao potrošnja kapsula u `logDose`.
        if (emailOut === 'sent' || pushOut === 'sent') {
          await db
            .update(supply)
            .set({ lowStockAlertsSent: sql`${supply.lowStockAlertsSent} + 1` })
            .where(eq(supply.userId, c.id))
        }

        return { email: emailOut, push: pushOut }
      },
    )

    for (const r of outcomes) {
      if (r.status === 'rejected') {
        // Pad je izolovan na jednog korisnika; oba kanala mu se broje kao neuspela.
        emailStats.failed += 1
        pushStats.failed += 1
        logError(EVENTS.emailSendFailed, r.reason, { job: CRON_JOBS.lowStock, stage: 'user_batch' })
        continue
      }
      const { email, push } = r.value
      if (email === 'sent') emailStats.sent += 1
      else if (email === 'failed') emailStats.failed += 1
      else if (email === 'skipped_opt_out') emailStats.skippedOptOut += 1
      else emailStats.skippedDedup += 1

      if (push === 'sent') pushStats.sent += 1
      else if (push === 'failed') pushStats.failed += 1
      else if (push === 'skipped_dedup') pushStats.skippedDedup += 1
      else pushStats.skippedNoSubscription += 1
    }
  }

  const body = {
    processed: candidates.length,
    lowStockUsers: lowStock.length,
    dedupDays: DEDUP_DAYS,
    /** Epizoda je potrošila `LOW_STOCK_MAX_ALERTS_PER_EPISODE` alerta — ćuti do dopune. */
    skippedEpisodeCapped: cappedOut,
    maxAlertsPerEpisode: LOW_STOCK_MAX_ALERTS_PER_EPISODE,
    byChannel: { email: emailStats, push: pushStats },
    totals: {
      sent: emailStats.sent + pushStats.sent,
      failed: emailStats.failed + pushStats.failed,
      skipped:
        emailStats.skippedDedup +
        emailStats.skippedOptOut +
        pushStats.skippedDedup +
        pushStats.skippedNoSubscription +
        cappedOut,
    },
    durationMs: Date.now() - startedAt,
  }

  await recordCronRun(CRON_JOBS.lowStock, body)
  logInfo(EVENTS.cronRun, {
    job: CRON_JOBS.lowStock,
    processed: body.processed,
    sent: body.totals.sent,
    failed: body.totals.failed,
    skipped: body.totals.skipped,
    durationMs: body.durationMs,
  })

  return NextResponse.json(body)
}
