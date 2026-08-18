import 'server-only'

import { and, eq, gte, isNotNull, sql } from 'drizzle-orm'

import {
  db,
  notificationsLog,
  orders,
  profiles,
  protocolLogs,
  pushSubscriptions,
} from '@/lib/db'
import { addDaysIso, belgradeToday } from '@/lib/dates'
import type { IsoDate } from '@/lib/protocol/streak'

import { getUserStatsForProfiles } from './user-stats'

/**
 * Agregati za admin pregled. Sve brojanje ide u JEDAN `Promise.all` (Neon HTTP
 * nema pooling — paralelno je bitno), pa se tek onda računaju streak-ovi nad
 * već učitanim profilima (`getUserStatsForProfiles` je bulk, 2 dodatna upita).
 */

/** Prozor za "porudžbine u poslednjih N dana" na dashboardu. */
export const ORDERS_WINDOW_DAYS = 30
/** Prozor za "poslate notifikacije". */
export const NOTIFICATIONS_WINDOW_DAYS = 7
/** Dužina serije dnevnih check-inova na grafikonu. */
export const CHECKINS_SERIES_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export interface DailyCheckins {
  date: IsoDate
  /** Broj označenih doza tog dana (max 2 po korisniku). */
  doses: number
  /** Broj različitih korisnika koji su tog dana označili bar jednu dozu. */
  users: number
}

export interface AdminMetrics {
  users: { total: number; vip: number; subscriber: number; inactive: number }
  ordersLast30d: number
  checkinsToday: { doses: number; users: number }
  /** Prosečan tekući streak korisnika koji su započeli protokol (1 decimala). */
  averageStreak: number
  /** Broj korisnika sa započetim protokolom — imenilac za `averageStreak`. */
  streakUserCount: number
  pushSubscriptions: number
  notificationsLast7d: { total: number; failed: number }
  dailyCheckins: DailyCheckins[]
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const today = belgradeToday()
  const seriesStart = addDaysIso(today, -(CHECKINS_SERIES_DAYS - 1))
  const ordersSince = new Date(Date.now() - ORDERS_WINDOW_DAYS * DAY_MS)
  const notificationsSince = new Date(Date.now() - NOTIFICATIONS_WINDOW_DAYS * DAY_MS)

  const [
    [userCounts],
    [orderCount],
    [todayCheckins],
    [pushCount],
    [notificationCounts],
    seriesRows,
    streakProfiles,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        vip: sql<number>`(count(*) filter (where ${profiles.accessStatus} = 'vip'))::int`,
        subscriber: sql<number>`(count(*) filter (where ${profiles.accessStatus} = 'subscriber'))::int`,
        inactive: sql<number>`(count(*) filter (where ${profiles.accessStatus} = 'inactive'))::int`,
      })
      .from(profiles),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(gte(orders.orderDate, ordersSince)),

    db
      .select({
        doses: sql<number>`count(*)::int`,
        users: sql<number>`count(distinct ${protocolLogs.userId})::int`,
      })
      .from(protocolLogs)
      .where(and(eq(protocolLogs.date, today), eq(protocolLogs.status, 'taken'))),

    db.select({ count: sql<number>`count(*)::int` }).from(pushSubscriptions),

    db
      .select({
        total: sql<number>`count(*)::int`,
        failed: sql<number>`(count(*) filter (where ${notificationsLog.status} <> 'success'))::int`,
      })
      .from(notificationsLog)
      .where(gte(notificationsLog.sentAt, notificationsSince)),

    db
      .select({
        date: protocolLogs.date,
        doses: sql<number>`count(*)::int`,
        users: sql<number>`count(distinct ${protocolLogs.userId})::int`,
      })
      .from(protocolLogs)
      .where(and(gte(protocolLogs.date, seriesStart), eq(protocolLogs.status, 'taken')))
      .groupBy(protocolLogs.date),

    db
      .select({
        id: profiles.id,
        email: profiles.email,
        role: profiles.role,
        protocolStartDate: profiles.protocolStartDate,
      })
      .from(profiles)
      .where(isNotNull(profiles.protocolStartDate)),
  ])

  const stats = await getUserStatsForProfiles(streakProfiles)
  const streakSum = [...stats.values()].reduce((sum, s) => sum + s.streak, 0)
  const streakUserCount = stats.size

  // Popuni rupe — dani bez ijednog check-ina moraju biti nule, ne praznine.
  const byDate = new Map(seriesRows.map((r) => [r.date, r]))
  const dailyCheckins: DailyCheckins[] = []
  for (let i = CHECKINS_SERIES_DAYS - 1; i >= 0; i--) {
    const date = addDaysIso(today, -i)
    const row = byDate.get(date)
    dailyCheckins.push({ date, doses: row?.doses ?? 0, users: row?.users ?? 0 })
  }

  return {
    users: {
      total: userCounts?.total ?? 0,
      vip: userCounts?.vip ?? 0,
      subscriber: userCounts?.subscriber ?? 0,
      inactive: userCounts?.inactive ?? 0,
    },
    ordersLast30d: orderCount?.count ?? 0,
    checkinsToday: { doses: todayCheckins?.doses ?? 0, users: todayCheckins?.users ?? 0 },
    averageStreak: streakUserCount > 0 ? Math.round((streakSum / streakUserCount) * 10) / 10 : 0,
    streakUserCount,
    pushSubscriptions: pushCount?.count ?? 0,
    notificationsLast7d: {
      total: notificationCounts?.total ?? 0,
      failed: notificationCounts?.failed ?? 0,
    },
    dailyCheckins,
  }
}
