import { and, eq, inArray, ne } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { db, profiles, protocolLogs } from '@/lib/db'
import type { Profile } from '@/lib/auth'
import { belgradeDayStart, belgradeTimeHM, belgradeToday, hmToMinutes } from '@/lib/dates'
import { getProtocolState } from '@/lib/protocol/queries'
import { filterNotifiedSince } from '@/lib/push/dedup'
import { sendPushToUser } from '@/lib/push/send'
import type { NotificationType } from '@/lib/push/types'

export const runtime = 'nodejs'

/**
 * Notification dispatcher — jedan endpoint za sve vremenski uslovljene push-eve.
 * Eksterni scheduler (cron-job.org) ga gađa na 15 min sa `Authorization: Bearer CRON_SECRET`.
 * NE ide u vercel.json. DST-safe: sve poredimo u beogradskom zidnom vremenu (Intl).
 *
 * Po run-u šalje:
 *  - jutarnji/večernji dose reminder (individualna vremena, prozor [vreme, +30min))
 *  - streak-at-risk (uveče, dan nekompletan, streak ≥ 1)
 * Dedup po beogradskom danu + tipu + kanalu (push) sprečava dupliranje između run-ova.
 */

/** Koliko minuta posle ciljanog vremena reminder još sme da se pošalje (širina prozora). */
const WINDOW_MIN = 30
/** Streak-at-risk ne šalji pre ovog sata (beogradsko veče). */
const STREAK_RISK_EARLIEST_MIN = 21 * 60
/** Streak-at-risk: koliko posle večernje doze počinje prozor. */
const STREAK_RISK_AFTER_EVENING_MIN = 90

/** Da li je `nowMin` u [start, start+WINDOW_MIN). */
function inWindow(nowMin: number, start: number): boolean {
  return nowMin >= start && nowMin < start + WINDOW_MIN
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const today = belgradeToday()
  const nowMin = hmToMinutes(belgradeTimeHM())
  const dayStart = belgradeDayStart()

  // Aktivni, onboardovani korisnici — jedini kandidati za bilo koju notifikaciju.
  const candidates: Profile[] = await db
    .select()
    .from(profiles)
    .where(and(ne(profiles.accessStatus, 'inactive'), eq(profiles.onboardingCompleted, true)))

  if (candidates.length === 0) {
    return NextResponse.json({ now: belgradeTimeHM(), morning: 0, evening: 0, streakAtRisk: 0 })
  }

  const ids = candidates.map((c) => c.id)

  // Današnji logovi za sve kandidate → Map<userId, { morning, evening }>.
  const todayLogs = await db
    .select({ userId: protocolLogs.userId, dose: protocolLogs.dose, status: protocolLogs.status })
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

    if (p.doseMorningTime && !taken.morning && inWindow(nowMin, hmToMinutes(p.doseMorningTime))) {
      morningTargets.push(p)
    }
    if (p.doseEveningTime && !taken.evening && inWindow(nowMin, hmToMinutes(p.doseEveningTime))) {
      eveningTargets.push(p)
    }

    // Streak-at-risk: dan nekompletan + u večernjem prozoru. Streak ≥ 1 se proverava
    // tek dole (getProtocolState), samo za one koji su prošli vremenski filter.
    const dayComplete = taken.morning && taken.evening
    const riskStart = Math.max(
      STREAK_RISK_EARLIEST_MIN,
      p.doseEveningTime ? hmToMinutes(p.doseEveningTime) + STREAK_RISK_AFTER_EVENING_MIN : 0,
    )
    if (!dayComplete && inWindow(nowMin, riskStart)) {
      streakRiskCandidates.push(p)
    }
  }

  // ── Dedup po danu (kanal: push) i slanje ──────────────────────────────────
  const sendReminders = async (
    targets: Profile[],
    type: NotificationType,
    title: string,
  ): Promise<number> => {
    if (targets.length === 0) return 0
    const notified = await filterNotifiedSince({
      userIds: targets.map((t) => t.id),
      type,
      since: dayStart,
      channel: 'push',
    })
    let sent = 0
    for (const p of targets) {
      if (notified.has(p.id)) continue
      const res = await sendPushToUser({ userId: p.id, type, title, body: 'Otvori protokol i označi dozu.', url: '/protokol', tag: type })
      if (res.sent > 0) sent += 1
    }
    return sent
  }

  const morning = await sendReminders(morningTargets, 'dose_reminder_morning', 'Vreme je za jutarnju dozu 🌿')
  const evening = await sendReminders(eveningTargets, 'dose_reminder_evening', 'Vreme je za večernju dozu 🌙')

  // Streak-at-risk: dodatni uslov streak ≥ 1 (skup query po korisniku, ali samo za uzak skup).
  let streakAtRisk = 0
  if (streakRiskCandidates.length > 0) {
    const notified = await filterNotifiedSince({
      userIds: streakRiskCandidates.map((t) => t.id),
      type: 'streak_at_risk',
      since: dayStart,
      channel: 'push',
    })
    for (const p of streakRiskCandidates) {
      if (notified.has(p.id)) continue
      const { streak } = await getProtocolState(p)
      if (streak.current < 1) continue
      const res = await sendPushToUser({
        userId: p.id,
        type: 'streak_at_risk',
        title: `Tvoj niz od ${streak.current} dana je na ivici ⏳`,
        body: 'Označi današnju dozu da ne prekineš niz.',
        url: '/protokol',
        tag: 'streak_at_risk',
      })
      if (res.sent > 0) streakAtRisk += 1
    }
  }

  return NextResponse.json({ now: belgradeTimeHM(), morning, evening, streakAtRisk })
}
