import 'server-only'

import { desc, eq, sql } from 'drizzle-orm'

import { VIP_WINDOW_DAYS, type AccessStatus, type Role } from '@/lib/access/status'
import { db, profiles, supply } from '@/lib/db'
import type { IsoDate } from '@/lib/protocol/streak'

import { emptyUserStats, getUserStatsForProfiles } from './user-stats'

/** Maksimalan broj redova u admin tabeli — MVP nema paginaciju. */
export const USERS_PAGE_SIZE = 100

const DAY_MS = 24 * 60 * 60 * 1000

export interface AdminUserRow {
  id: string
  email: string
  name: string | null
  role: Role
  accessStatus: AccessStatus
  streak: number
  capsulesRemaining: number | null
  lastCheckInDate: IsoDate | null
  latestOrderDate: Date | null
  /**
   * Ima li porudžbinu u VIP prozoru — odgovara uslovu koji noćni cron
   * (`maintainAccessStatuses`) proverava. Ako je `false`, ručno postavljen `vip`
   * neće preživeti cron. UI to prikazuje u dijalogu.
   */
  hasOrderInVipWindow: boolean
}

export interface ListAdminUsersResult {
  rows: AdminUserRow[]
  /** Ukupan broj korisnika koji odgovara pretrazi (pre `limit`-a). */
  total: number
  truncated: boolean
}

/**
 * Lista korisnika za admin tabelu, sa server-side pretragom po mejlu.
 * Pretraga je uvek u SQL-u (`ilike`) — nikad se ne filtrira cela lista na klijentu.
 */
export async function listAdminUsers(search?: string): Promise<ListAdminUsersResult> {
  const q = search?.trim().toLowerCase()
  const where = q
    ? sql`lower(${profiles.email}) like ${`%${q}%`} or lower(coalesce(${profiles.name}, '')) like ${`%${q}%`}`
    : undefined

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: profiles.id,
        email: profiles.email,
        name: profiles.name,
        role: profiles.role,
        accessStatus: profiles.accessStatus,
        protocolStartDate: profiles.protocolStartDate,
        capsulesRemaining: supply.capsulesRemaining,
      })
      .from(profiles)
      .leftJoin(supply, eq(supply.userId, profiles.id))
      .where(where)
      .orderBy(desc(profiles.createdAt))
      .limit(USERS_PAGE_SIZE),
    db.select({ count: sql<number>`count(*)::int` }).from(profiles).where(where),
  ])

  const stats = await getUserStatsForProfiles(rows)
  const vipCutoff = Date.now() - VIP_WINDOW_DAYS * DAY_MS

  return {
    rows: rows.map((row) => {
      const s = stats.get(row.id) ?? emptyUserStats()
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        accessStatus: row.accessStatus,
        streak: s.streak,
        capsulesRemaining: row.capsulesRemaining,
        lastCheckInDate: s.lastCheckInDate,
        latestOrderDate: s.latestOrderDate,
        hasOrderInVipWindow: Boolean(s.latestOrderDate && s.latestOrderDate.getTime() >= vipCutoff),
      }
    }),
    total: countRow?.count ?? 0,
    truncated: (countRow?.count ?? 0) > USERS_PAGE_SIZE,
  }
}
