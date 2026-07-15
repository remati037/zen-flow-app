import 'server-only'

import { and, eq, gte, sql } from 'drizzle-orm'

import { db, orders, protocolLogs } from '@/lib/db'
import type { Profile } from '@/lib/auth'
import { addDaysIso, belgradeToday, toBelgradeIso } from '@/lib/dates'
import {
  type CoveredRange,
  type DayStatus,
  type IsoDate,
  type StreakResult,
  computeStreak,
  isCovered,
  mergeCoveredRanges,
} from './streak'

const LOOKBACK_DAYS = 400

type DoseStatus = 'taken' | 'skipped'

export interface TodayDoses {
  morning: DoseStatus | null
  evening: DoseStatus | null
}

export interface WeekStripDay {
  date: IsoDate
  status: DayStatus
  isToday: boolean
  /** Per-dozni status tog dana — za backfill dijalog na klik. */
  doses: TodayDoses
}

export interface ProtocolState {
  streak: StreakResult
  todayDoses: TodayDoses
  weekStrip: WeekStripDay[]
}

/** Grupiše logove po datumu → { morning, evening } statusi. */
function indexLogsByDate(
  logs: { date: string; dose: 'morning' | 'evening'; status: DoseStatus }[],
): Map<IsoDate, TodayDoses> {
  const byDate = new Map<IsoDate, TodayDoses>()
  for (const log of logs) {
    const entry = byDate.get(log.date) ?? { morning: null, evening: null }
    entry[log.dose] = log.status
    byDate.set(log.date, entry)
  }
  return byDate
}

function dayStatus(entry: TodayDoses | undefined, covered: boolean): DayStatus {
  if (!covered) return 'frozen'
  const taken =
    (entry?.morning === 'taken' ? 1 : 0) + (entry?.evening === 'taken' ? 1 : 0)
  if (taken === 2) return 'complete'
  if (taken === 1) return 'partial'
  return 'missed'
}

/**
 * Sastavlja kompletno stanje protokola za jedan profil: streak (uz pauzu za
 * inactive periode), današnje doze i 7-dnevni strip. Jedini DB dodir za
 * protokol UI — čita logove + datume porudžbina, ostalo je čista logika.
 */
export async function getProtocolState(profile: Profile): Promise<ProtocolState> {
  const today = belgradeToday()
  const since = addDaysIso(today, -LOOKBACK_DAYS)

  const [logs, orderRows] = await Promise.all([
    db
      .select({
        date: protocolLogs.date,
        dose: protocolLogs.dose,
        status: protocolLogs.status,
      })
      .from(protocolLogs)
      .where(and(eq(protocolLogs.userId, profile.id), gte(protocolLogs.date, since))),
    db
      .select({ orderDate: orders.orderDate })
      .from(orders)
      .where(sql`lower(${orders.email}) = ${profile.email.trim().toLowerCase()}`),
  ])

  const byDate = indexLogsByDate(logs)

  const completedDates = new Set<IsoDate>()
  for (const [date, entry] of byDate) {
    if (entry.morning === 'taken' && entry.evening === 'taken') completedDates.add(date)
  }

  const alwaysCovered = profile.role === 'admin'
  const coveredRanges: CoveredRange[] = mergeCoveredRanges(
    orderRows.map((r) => toBelgradeIso(r.orderDate)),
  )

  const streak = computeStreak({
    completedDates,
    coveredRanges,
    alwaysCovered,
    today,
    startDate: profile.protocolStartDate,
  })

  const weekStrip: WeekStripDay[] = []
  for (let i = 6; i >= 0; i--) {
    const date = addDaysIso(today, -i)
    const entry = byDate.get(date)
    weekStrip.push({
      date,
      status: dayStatus(entry, isCovered(date, coveredRanges, alwaysCovered)),
      isToday: i === 0,
      doses: { morning: entry?.morning ?? null, evening: entry?.evening ?? null },
    })
  }

  const todayEntry = byDate.get(today)
  const todayDoses: TodayDoses = {
    morning: todayEntry?.morning ?? null,
    evening: todayEntry?.evening ?? null,
  }

  return { streak, todayDoses, weekStrip }
}
