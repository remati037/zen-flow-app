import 'server-only'

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { ACCESS_WINDOW_DAYS, accessWindowEnd } from '@/lib/access/window'
import {
  WINBACK_STAGES,
  winbackStageFor,
  winbackType,
  type WinbackStage,
} from '@/lib/access/winback-rules'
import type { Profile } from '@/lib/auth'
import { runChunked } from '@/lib/cron/fanout'
import { BELGRADE_TZ, addDaysIso, daysBetweenIso } from '@/lib/dates'
import { db, orders, profiles } from '@/lib/db'
import { APP_URL } from '@/lib/app-url'
import { sendWinbackEmail } from '@/lib/email/send'
import { EVENTS, logError } from '@/lib/observability/log'
import { getProtocolState } from '@/lib/protocol/queries'
import { filterNotifiedSince } from '@/lib/push/dedup'
import { refillUrl } from '@/lib/refill'
import { SYNCED_STATUSES } from '@/lib/woocommerce/order-rules'

/**
 * Zona kao SQL literal, ne bind parametar — isti razlog kao u `lib/admin/delivery.ts`
 * (agregat sa izrazom; konstanta je naša, nikad korisnički unos).
 */
const tz = sql.raw(`'${BELGRADE_TZ}'`)

export type WinbackCandidate = {
  profile: Profile
  /** Beogradski dan poslednje VAŽEĆE porudžbine. */
  lastOrderDay: string
  /** Poslednji dan pristupa (`accessWindowEnd`). */
  expiryDay: string
  daysSinceExpiry: number
  stage: WinbackStage
}

/**
 * Kupci kojima je pristup istekao i koji su danas u nekoj win-back fazi.
 *
 * Uslovi:
 *  - `inactive`, rola `user`, BEZ ručnog override-a (admin koji je nekome namerno
 *    ugasio pristup ne želi da mu cron šalje „vrati se");
 *  - poslednja važeća porudžbina takva da je od isteka prošlo [1, 28) dana (`WINBACK_STAGES`) — širi
 *    prozor od toga se ne čita iz baze uopšte, pa puštanje funkcije ne pravi
 *    talas mejlova ka svim bivšim kupcima.
 */
export async function getWinbackCandidates(today: string): Promise<WinbackCandidate[]> {
  // daysSinceExpiry = today − (orderDay + 60) ∈ [first.from, last.to)
  //   ⇔ orderDay ∈ [today − 60 − (last.to − 1), today − 60 − first.from]
  const first = WINBACK_STAGES[0]
  const last = WINBACK_STAGES[WINBACK_STAGES.length - 1]
  const newestOrderDay = addDaysIso(today, -ACCESS_WINDOW_DAYS - first.from)
  const oldestOrderDay = addDaysIso(today, -ACCESS_WINDOW_DAYS - (last.to - 1))

  const lastOrderDay = sql<string>`(max(${orders.orderDate}) at time zone ${tz})::date::text`

  const rows = await db
    .select({ profile: profiles, lastOrderDay })
    .from(profiles)
    .innerJoin(
      orders,
      and(
        sql`lower(${orders.email}) = lower(${profiles.email})`,
        inArray(orders.status, [...SYNCED_STATUSES]),
      ),
    )
    .where(
      and(
        eq(profiles.accessStatus, 'inactive'),
        eq(profiles.role, 'user'),
        isNull(profiles.accessOverride),
      ),
    )
    // `profiles.id` je PK — Postgres dozvoljava ostale kolone profila u select-u
    // (funkcionalna zavisnost). Bez bind parametara u GROUP BY.
    .groupBy(profiles.id)
    .having(
      sql`(max(${orders.orderDate}) at time zone ${tz})::date between ${oldestOrderDay}::date and ${newestOrderDay}::date`,
    )

  const candidates: WinbackCandidate[] = []
  for (const row of rows) {
    const expiryDay = accessWindowEnd(row.lastOrderDay)
    const daysSinceExpiry = daysBetweenIso(expiryDay, today)
    const stage = winbackStageFor(daysSinceExpiry)
    if (stage === null) continue
    candidates.push({ profile: row.profile, lastOrderDay: row.lastOrderDay, expiryDay, daysSinceExpiry, stage })
  }
  return candidates
}

export type WinbackRunResult = {
  candidates: number
  sent: number
  failed: number
  skippedDedup: number
  skippedOptOut: number
  byStage: Record<WinbackStage, number>
}

/**
 * Pošalje win-back mejl svakom kandidatu, najviše JEDNOM po fazi po isteku.
 *
 * Dedup: `filterNotifiedSince` od dana pre isteka (faze su ≥ 1 dan posle, a
 * prethodni istek je bar 60 dana ranije, pa se epizode ne mešaju) + dnevna
 * rezervacija u `sendEmail` za preklapajuće run-ove. Opt-out (`email_alerts`)
 * proverava `sendEmail` — win-back je u `EMAIL_ALERT_TYPES`.
 */
export async function runWinback(today: string): Promise<WinbackRunResult> {
  const result: WinbackRunResult = {
    candidates: 0,
    sent: 0,
    failed: 0,
    skippedDedup: 0,
    skippedOptOut: 0,
    byStage: { 1: 0, 2: 0, 3: 0 },
  }

  const candidates = await getWinbackCandidates(today)
  result.candidates = candidates.length
  if (candidates.length === 0) return result

  // Dedup po fazi: svaka faza je zaseban tip notifikacije.
  const alreadySent = new Map<WinbackStage, Set<string>>()
  for (const stage of [1, 2, 3] as const) {
    const ofStage = candidates.filter((c) => c.stage === stage)
    if (ofStage.length === 0) continue
    const earliestExpiry = ofStage.reduce((min, c) => (c.expiryDay < min ? c.expiryDay : min), ofStage[0].expiryDay)
    alreadySent.set(
      stage,
      await filterNotifiedSince({
        userIds: ofStage.map((c) => c.profile.id),
        type: winbackType(stage),
        since: new Date(`${addDaysIso(earliestExpiry, -1)}T00:00:00Z`),
        channel: 'email',
      }),
    )
  }

  const ctaHref = refillUrl('email_winback') ?? process.env.WOO_STORE_URL ?? `${APP_URL}/nemas-pristup`

  const outcomes = await runChunked(candidates, async (c) => {
    if (alreadySent.get(c.stage)?.has(c.profile.id)) return 'skipped_dedup' as const
    // Niz u trenutku isteka: dani posle isteka nisu pokriveni pa su „frozen" —
    // tekući niz je tačno onaj koji je pauziran.
    const { streak } = await getProtocolState(c.profile)
    const res = await sendWinbackEmail(
      c.profile,
      { stage: c.stage, pausedStreak: streak.current, ctaHref },
      { dedup: { day: today } },
    )
    if (res.skippedOptOut) return 'skipped_opt_out' as const
    if (res.skippedDedup) return 'skipped_dedup' as const
    if (res.ok) result.byStage[c.stage] += 1
    return res.ok ? ('sent' as const) : ('failed' as const)
  })

  for (const o of outcomes) {
    if (o.status === 'rejected') {
      result.failed += 1
      logError(EVENTS.emailSendFailed, o.reason, { stage: 'winback_batch' })
      continue
    }
    if (o.value === 'sent') result.sent += 1
    else if (o.value === 'failed') result.failed += 1
    else if (o.value === 'skipped_opt_out') result.skippedOptOut += 1
    else result.skippedDedup += 1
  }
  return result
}
