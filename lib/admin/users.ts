import 'server-only'

import { desc, eq, sql } from 'drizzle-orm'

import type { AccessStatus, Role } from '@/lib/access/status'
import { isWithinAccessWindow } from '@/lib/access/window'
import { belgradeToday, toBelgradeIso } from '@/lib/dates'
import { db, profiles, supply } from '@/lib/db'
import type { IsoDate } from '@/lib/protocol/streak'

import { emptyUserStats, getUserStatsForProfiles } from './user-stats'

/** Maksimalan broj redova u admin tabeli — MVP nema paginaciju. */
export const USERS_PAGE_SIZE = 100

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
   * Ima li porudžbinu u VIP prozoru — uslov koji proverava automatika
   * (`resolveAccessStatus` / `maintainAccessStatuses`). Kaže šta bi nalog dobio
   * KAD BI se override skinuo; UI to prikazuje u dijalogu.
   */
  hasOrderInVipWindow: boolean
  /** Ručni override pristupa, ili `null` kad je nalog pod automatikom. */
  accessOverride: 'vip' | 'inactive' | null
  accessOverrideAt: Date | null
  /** Clerk user id admina koji je postavio override (prikazuje se skraćeno). */
  accessOverrideBy: string | null
}

export interface ListAdminUsersResult {
  rows: AdminUserRow[]
  /** Ukupan broj korisnika koji odgovara pretrazi (pre `limit`-a). */
  total: number
  truncated: boolean
}

/**
 * Escape-uje metaznakove `LIKE` pattern-a (`%`, `_`) i sam escape karakter (`\`).
 *
 * Bez ovoga admin koji ukuca `%` dobija match nad SVIM korisnicima, a `_` se ponaša
 * kao "bilo koji znak" — pretraga tiho vraća pogrešan skup. Nije SQL injection
 * (vrednost ide kao bind parametar), nego injection u sam pattern.
 *
 * Napomena: Postgres `LIKE` poznaje samo `%` i `_` kao metaznakove — uglaste zagrade
 * su SQL Server sintaksa i ovde su OBIČNI znaci, pa se namerno NE escape-uju
 * (escape-ovanjem bismo pokvarili pretragu imena sa zagradama).
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/**
 * Lista korisnika za admin tabelu, sa server-side pretragom po mejlu.
 * Pretraga je uvek u SQL-u (`ilike`) — nikad se ne filtrira cela lista na klijentu.
 */
export async function listAdminUsers(search?: string): Promise<ListAdminUsersResult> {
  const q = search?.trim().toLowerCase()
  // Pattern ide kao bind parametar, pa Postgres ne parsira string literal — backslash
  // u vrednosti je pravi backslash, a to je i default `ESCAPE` znak za `LIKE`.
  // Zato nema eksplicitne `ESCAPE` klauzule: bila bi šum, ne dodatna garancija.
  const pattern = q ? `%${escapeLikePattern(q)}%` : null
  const where = pattern
    ? sql`lower(${profiles.email}) like ${pattern} or lower(coalesce(${profiles.name}, '')) like ${pattern}`
    : undefined

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: profiles.id,
        email: profiles.email,
        name: profiles.name,
        role: profiles.role,
        accessStatus: profiles.accessStatus,
        accessOverride: profiles.accessOverride,
        accessOverrideAt: profiles.accessOverrideAt,
        accessOverrideBy: profiles.accessOverrideBy,
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
  const today = belgradeToday()

  return {
    rows: rows.map((row) => {
      const s = stats.get(row.id) ?? emptyUserStats()
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        accessStatus: row.accessStatus,
        // Enum kolone dele tip sa `access_status`, pa `subscriber` prolazi kroz
        // TypeScript; CHECK u bazi ga zabranjuje, a ovde ga svodimo na `null`.
        accessOverride:
          row.accessOverride === 'vip' || row.accessOverride === 'inactive'
            ? row.accessOverride
            : null,
        accessOverrideAt: row.accessOverrideAt,
        accessOverrideBy: row.accessOverrideBy,
        streak: s.streak,
        capsulesRemaining: row.capsulesRemaining,
        lastCheckInDate: s.lastCheckInDate,
        latestOrderDate: s.latestOrderDate,
        hasOrderInVipWindow: Boolean(
          s.latestOrderDate && isWithinAccessWindow(toBelgradeIso(s.latestOrderDate), today),
        ),
      }
    }),
    total: countRow?.count ?? 0,
    truncated: (countRow?.count ?? 0) > USERS_PAGE_SIZE,
  }
}
