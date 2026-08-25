import { and, eq, inArray, ne } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { requireCronAuth } from '@/lib/cron/auth'
import { runChunked } from '@/lib/cron/fanout'
import { CRON_JOBS, isGapMissed } from '@/lib/cron/health'
import { recordCronRun } from '@/lib/cron/heartbeat'
import { db, profiles, protocolLogs } from '@/lib/db'
import { EVENTS, logError, logInfo } from '@/lib/observability/log'
import type { Profile } from '@/lib/auth'
import { belgradeDayStart, belgradeTimeHM, belgradeToday, hmToMinutes } from '@/lib/dates'
import { getProtocolState } from '@/lib/protocol/queries'
import { filterNotifiedSince } from '@/lib/push/dedup'
import {
  WINDOW_MIN,
  inWindow,
  reminderWindowStart,
  streakRiskWindowStart,
} from '@/lib/push/dispatch-rules'
import { sendPushToUser } from '@/lib/push/send'
import type { NotificationType } from '@/lib/push/types'

export const runtime = 'nodejs'

/**
 * Tvrdi budžet trajanja funkcije.
 *
 * Vercel Hobby dozvoljava najviše **60 s** po pozivu (Pro ide dalje) — uzimamo
 * ceo maksimum jer je ova ruta batch posao: `runChunked` sa 12 paralelnih
 * korisnika i 5 s timeout-om po slanju znači da i najgori realan batch stane
 * unutar minuta. Bez eksplicitne vrednosti Next koristi Vercel default (10 s na
 * Hobby-ju), a to seče batch u sredini — poslednji korisnici ostaju bez
 * podsetnika, i to bez ijedne greške u logu.
 *
 * Ako se pređe na Pro, ovo NE treba dizati automatski: batch koji ne staje u 60 s
 * treba deliti na više run-ova, ne produžavati (vidi komentar uz `FANOUT_CHUNK`).
 */
export const maxDuration = 60

/**
 * Notification dispatcher — jedan endpoint za sve vremenski uslovljene push-eve.
 * Eksterni scheduler (GitHub Actions / cron-job.org) ga gađa na 15 min sa
 * `Authorization: Bearer CRON_SECRET`. NE ide u vercel.json.
 * DST-safe: sve poredimo u beogradskom zidnom vremenu (Intl).
 *
 * Po run-u šalje:
 *  - jutarnji/večernji dose reminder (individualna vremena, prozor `[vreme, +WINDOW_MIN)`)
 *  - streak-at-risk (uveče, dan nekompletan, streak ≥ 1)
 *
 * Dedup po beogradskom danu + tipu + kanalu (push) sprečava dupliranje između
 * run-ova — zato je prozor smeo da se proširi na 45 min bez rizika od duplikata.
 *
 * Svaki run upisuje heartbeat u `cron_runs` BEZ OBZIRA na ishod, pa admin
 * dijagnostika može da razlikuje „nema kandidata" od „scheduler je mrtav".
 */

/** Ishod obrade jednog korisnika — brojači u odgovoru rute se izvode iz ovoga. */
type Outcome = 'sent' | 'failed' | 'no_subscription' | 'skipped_dedup' | 'skipped_no_streak'

type TypeStats = {
  /** Koliko korisnika je ušlo u vremenski prozor za ovaj tip. */
  candidates: number
  sent: number
  failed: number
  /** Već obavešten danas — dedup je odradio posao (očekivano, nije problem). */
  skippedDedup: number
  /** Nema push pretplatu — slanje nije ni pokušano. */
  skippedNoSubscription: number
  /** Samo `streak_at_risk`: streak je 0, nema šta da se izgubi. */
  skippedNoStreak: number
}

function emptyStats(candidates: number): TypeStats {
  return {
    candidates,
    sent: 0,
    failed: 0,
    skippedDedup: 0,
    skippedNoSubscription: 0,
    skippedNoStreak: 0,
  }
}

function tally(stats: TypeStats, outcomes: PromiseSettledResult<Outcome>[], type: string): TypeStats {
  for (const r of outcomes) {
    if (r.status === 'rejected') {
      // `runChunked` izoluje pad po korisniku; ovde ga samo prebrojimo i zabeležimo.
      // Ranije je isti pad rušio ceo batch i niko taj dan nije dobio podsetnik.
      stats.failed += 1
      logError(EVENTS.pushSendFailed, r.reason, { job: CRON_JOBS.notifications, type })
      continue
    }
    switch (r.value) {
      case 'sent':
        stats.sent += 1
        break
      case 'failed':
        stats.failed += 1
        break
      case 'no_subscription':
        stats.skippedNoSubscription += 1
        break
      case 'skipped_dedup':
        stats.skippedDedup += 1
        break
      case 'skipped_no_streak':
        stats.skippedNoStreak += 1
        break
    }
  }
  return stats
}

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const startedAt = Date.now()
  const today = belgradeToday()
  const nowMin = hmToMinutes(belgradeTimeHM())
  const dayStart = belgradeDayStart()

  // Aktivni, onboardovani korisnici — jedini kandidati za bilo koju notifikaciju.
  const candidates: Profile[] = await db
    .select()
    .from(profiles)
    .where(and(ne(profiles.accessStatus, 'inactive'), eq(profiles.onboardingCompleted, true)))

  const ids = candidates.map((c) => c.id)

  // Današnji logovi za sve kandidate → Map<userId, { morning, evening }>.
  const todayLogs =
    ids.length === 0
      ? []
      : await db
          .select({
            userId: protocolLogs.userId,
            dose: protocolLogs.dose,
            status: protocolLogs.status,
          })
          .from(protocolLogs)
          .where(and(inArray(protocolLogs.userId, ids), eq(protocolLogs.date, today)))

  const logsByUser = new Map<string, { morning: boolean; evening: boolean }>()
  for (const log of todayLogs) {
    const entry = logsByUser.get(log.userId) ?? { morning: false, evening: false }
    // "Uzeta" doza (taken) blokira reminder; skipped ostavlja mogućnost, ali dan nije kompletan.
    if (log.status === 'taken') entry[log.dose] = true
    logsByUser.set(log.userId, entry)
  }

  // ── Sakupi kandidate po tipu (pre dedup-a) ────────────────────────────────
  const morningTargets: Profile[] = []
  const eveningTargets: Profile[] = []
  const streakRiskCandidates: Profile[] = []

  for (const p of candidates) {
    const taken = logsByUser.get(p.id) ?? { morning: false, evening: false }

    // `reminderWindowStart` clamp-uje prozor da stane u dan — bez toga doza
    // podešena kasno uveče nikad ne dobije podsetnik (prozor prelazi ponoć).
    if (
      p.doseMorningTime &&
      !taken.morning &&
      inWindow(nowMin, reminderWindowStart(hmToMinutes(p.doseMorningTime)))
    ) {
      morningTargets.push(p)
    }
    if (
      p.doseEveningTime &&
      !taken.evening &&
      inWindow(nowMin, reminderWindowStart(hmToMinutes(p.doseEveningTime)))
    ) {
      eveningTargets.push(p)
    }

    // Streak-at-risk: dan nekompletan + u večernjem prozoru. Streak ≥ 1 se proverava
    // tek dole (getProtocolState), samo za one koji su prošli vremenski filter.
    const dayComplete = taken.morning && taken.evening
    const riskStart = streakRiskWindowStart(
      p.doseEveningTime ? hmToMinutes(p.doseEveningTime) : null,
    )
    if (!dayComplete && inWindow(nowMin, riskStart)) {
      streakRiskCandidates.push(p)
    }
  }

  // ── Dedup po danu (kanal: push) i paralelno slanje ────────────────────────
  const sendReminders = async (
    targets: Profile[],
    type: NotificationType,
    title: string,
  ): Promise<TypeStats> => {
    const stats = emptyStats(targets.length)
    if (targets.length === 0) return stats

    const notified = await filterNotifiedSince({
      userIds: targets.map((t) => t.id),
      type,
      since: dayStart,
      channel: 'push',
    })

    const outcomes = await runChunked<Profile, Outcome>(targets, async (p) => {
      if (notified.has(p.id)) return 'skipped_dedup'
      const res = await sendPushToUser({
        userId: p.id,
        type,
        title,
        body: 'Otvori protokol i označi dozu.',
        url: '/protokol',
        tag: type,
        // Bulk `filterNotifiedSince` iznad je samo jeftin pred-filter; ODLUKU donosi
        // rezervacija u `sendPushToUser`. Dva run-a u istom prozoru oba prođu filter
        // (obojica čitaju pre nego što bilo ko upiše) — sudaraju se tek na unique
        // indeksu, i gubitnik se ovde vraća kao `skippedDedup`.
        dedup: { day: today },
      })
      if (res.skippedDedup) return 'skipped_dedup'
      if (res.sent > 0) return 'sent'
      // `sendPushToUser` nikad ne baca: prazan `failures` znači da korisnik
      // prosto nema pretplatu, a to nije otkaz nego stanje.
      return res.failures.length > 0 ? 'failed' : 'no_subscription'
    })

    return tally(stats, outcomes, type)
  }

  // Tri tipa idu sekvencijalno (paralelizam je UNUTAR tipa) — inače bi tri
  // fan-outa od po 12 dala 36 istovremenih korisnika i pojela isti budžet koji
  // `FANOUT_CHUNK` čuva. Skupovi su i disjunktni po prirodi prozora.
  const morning = await sendReminders(
    morningTargets,
    'dose_reminder_morning',
    'Vreme je za jutarnju dozu 🌿',
  )
  const evening = await sendReminders(
    eveningTargets,
    'dose_reminder_evening',
    'Vreme je za večernju dozu 🌙',
  )

  // Streak-at-risk: dodatni uslov streak ≥ 1 (skup query po korisniku, ali samo
  // za uzak skup koji je prošao vremenski filter).
  const streakStats = emptyStats(streakRiskCandidates.length)
  if (streakRiskCandidates.length > 0) {
    const notified = await filterNotifiedSince({
      userIds: streakRiskCandidates.map((t) => t.id),
      type: 'streak_at_risk',
      since: dayStart,
      channel: 'push',
    })

    const outcomes = await runChunked<Profile, Outcome>(streakRiskCandidates, async (p) => {
      if (notified.has(p.id)) return 'skipped_dedup'
      // `getProtocolState` čita porudžbine i logove i MOŽE da baci (npr. profil
      // sa neispravnim `protocol_start_date`). `runChunked` taj pad drži unutar
      // jednog korisnika — ostatak batch-a ide dalje.
      const { streak } = await getProtocolState(p)
      if (streak.current < 1) return 'skipped_no_streak'
      const res = await sendPushToUser({
        userId: p.id,
        type: 'streak_at_risk',
        title: `Tvoj niz od ${streak.current} dana je na ivici ⏳`,
        body: 'Označi današnju dozu da ne prekineš niz.',
        url: '/protokol',
        tag: 'streak_at_risk',
        dedup: { day: today },
      })
      if (res.skippedDedup) return 'skipped_dedup'
      if (res.sent > 0) return 'sent'
      return res.failures.length > 0 ? 'failed' : 'no_subscription'
    })

    tally(streakStats, outcomes, 'streak_at_risk')
  }

  const byType = {
    dose_reminder_morning: morning,
    dose_reminder_evening: evening,
    streak_at_risk: streakStats,
  }

  const totals = Object.values(byType).reduce(
    (acc, s) => ({
      candidates: acc.candidates + s.candidates,
      sent: acc.sent + s.sent,
      failed: acc.failed + s.failed,
      skipped:
        acc.skipped + s.skippedDedup + s.skippedNoSubscription + s.skippedNoStreak,
    }),
    { candidates: 0, sent: 0, failed: 0, skipped: 0 },
  )

  const body = {
    now: belgradeTimeHM(),
    today,
    windowMin: WINDOW_MIN,
    eligibleProfiles: candidates.length,
    totals,
    byType,
    durationMs: Date.now() - startedAt,
  }

  // Heartbeat na kraju: upisuje se i kad je sve nula, jer je „ruta je pozvana"
  // podatak koji `notifications_log` nikad nema. Vraćeni `gapMin` odmah kaže da
  // li je scheduler propustio prozor.
  const beat = await recordCronRun(CRON_JOBS.notifications, body)

  // Jedan strukturni red po run-u: `cron_runs` čuva samo POSLEDNJI rezultat, a ovo
  // ostaje u logovima kao serija — bez nje se „koliko je podsetnika izašlo prošle
  // srede" ne može rekonstruisati ni iz čega.
  logInfo(EVENTS.cronRun, {
    job: CRON_JOBS.notifications,
    candidates: totals.candidates,
    sent: totals.sent,
    failed: totals.failed,
    skipped: totals.skipped,
    gapMin: beat?.gapMin ?? null,
    gapMissedWindow: isGapMissed(beat?.gapMin ?? null, WINDOW_MIN),
    durationMs: body.durationMs,
  })

  return NextResponse.json({
    ...body,
    schedule: {
      gapMin: beat?.gapMin ?? null,
      /** Razmak širi od prozora = podsetnici u toj rupi su izgubljeni. */
      gapMissedWindow: isGapMissed(beat?.gapMin ?? null, WINDOW_MIN),
      maxGapMin: beat?.maxGapMin ?? null,
      runsTotal: beat?.runsTotal ?? null,
    },
  })
}
