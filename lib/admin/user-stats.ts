import 'server-only'

import { and, gte, inArray, sql } from 'drizzle-orm'

import { db, orders, protocolLogs } from '@/lib/db'
import { addDaysIso, belgradeToday, toBelgradeIso } from '@/lib/dates'
import {
  type CoveredRange,
  type IsoDate,
  computeStreak,
  mergeCoveredRanges,
} from '@/lib/protocol/streak'

/**
 * Bulk verzija `lib/protocol/queries.ts` — isti izvor istine za streak
 * (`computeStreak`), ali za N korisnika kroz 2 upita umesto 2 upita po korisniku.
 * Koristi je i admin lista korisnika i `lib/admin/metrics.ts` (prosečan streak).
 */

/** Isti prozor kao `getProtocolState` — koliko dana logova čitamo unazad. */
const LOOKBACK_DAYS = 400

export interface StatsProfileInput {
  id: string
  email: string
  role: 'admin' | 'user'
  /** `profiles.protocol_start_date` ('YYYY-MM-DD') — bez njega nema streak-a. */
  protocolStartDate: string | null
}

export interface UserStats {
  streak: number
  longestStreak: number
  /** Poslednji dan sa bar jednom uzetom dozom, ili `null`. */
  lastCheckInDate: IsoDate | null
  /** Datum poslednje porudžbine (bilo kada), ili `null` — osnov za VIP prozor. */
  latestOrderDate: Date | null
}

const EMPTY_STATS: UserStats = {
  streak: 0,
  longestStreak: 0,
  lastCheckInDate: null,
  latestOrderDate: null,
}

/** Prazan rezultat za profil koji nema podataka — da pozivaoci ne rade null-check. */
export function emptyUserStats(): UserStats {
  return { ...EMPTY_STATS }
}

/**
 * Za dati skup profila vrati streak, poslednji check-in i datum poslednje
 * porudžbine. Dva bulk upita (logovi + porudžbine), ostatak je čista logika iz
 * `lib/protocol/streak.ts` — pa se admin brojevi ne mogu razići od korisničkih.
 */
export async function getUserStatsForProfiles(
  profiles: StatsProfileInput[],
): Promise<Map<string, UserStats>> {
  const stats = new Map<string, UserStats>()
  if (profiles.length === 0) return stats

  const today = belgradeToday()
  const since = addDaysIso(today, -LOOKBACK_DAYS)

  const userIds = profiles.map((p) => p.id)
  const emails = [...new Set(profiles.map((p) => p.email.trim().toLowerCase()))]

  const [logs, orderRows] = await Promise.all([
    db
      .select({
        userId: protocolLogs.userId,
        date: protocolLogs.date,
        dose: protocolLogs.dose,
        status: protocolLogs.status,
      })
      .from(protocolLogs)
      .where(and(inArray(protocolLogs.userId, userIds), gte(protocolLogs.date, since))),
    db
      .select({ email: orders.email, orderDate: orders.orderDate })
      .from(orders)
      .where(inArray(sql`lower(${orders.email})`, emails)),
  ])

  // userId → datum → { morning, evening } uzeto?
  const takenByUser = new Map<string, Map<IsoDate, { morning: boolean; evening: boolean }>>()
  for (const log of logs) {
    if (log.status !== 'taken') continue
    let byDate = takenByUser.get(log.userId)
    if (!byDate) {
      byDate = new Map()
      takenByUser.set(log.userId, byDate)
    }
    const entry = byDate.get(log.date) ?? { morning: false, evening: false }
    entry[log.dose] = true
    byDate.set(log.date, entry)
  }

  // lowercase email → datumi porudžbina (za coverage) + najnoviji datum
  const ordersByEmail = new Map<string, Date[]>()
  for (const row of orderRows) {
    const key = row.email.trim().toLowerCase()
    const list = ordersByEmail.get(key)
    if (list) list.push(row.orderDate)
    else ordersByEmail.set(key, [row.orderDate])
  }

  for (const profile of profiles) {
    const byDate = takenByUser.get(profile.id)
    const userOrders = ordersByEmail.get(profile.email.trim().toLowerCase()) ?? []

    const completedDates = new Set<IsoDate>()
    let lastCheckInDate: IsoDate | null = null
    if (byDate) {
      for (const [date, entry] of byDate) {
        if (entry.morning && entry.evening) completedDates.add(date)
        if (!lastCheckInDate || date > lastCheckInDate) lastCheckInDate = date
      }
    }

    const coveredRanges: CoveredRange[] = mergeCoveredRanges(userOrders.map(toBelgradeIso))
    const { current, longest } = computeStreak({
      completedDates,
      coveredRanges,
      alwaysCovered: profile.role === 'admin',
      today,
      startDate: profile.protocolStartDate,
    })

    const latestOrderDate = userOrders.reduce<Date | null>(
      (max, d) => (!max || d > max ? d : max),
      null,
    )

    stats.set(profile.id, {
      streak: current,
      longestStreak: longest,
      lastCheckInDate,
      latestOrderDate,
    })
  }

  return stats
}
