import 'server-only'

import { and, desc, eq, sql } from 'drizzle-orm'

import { accessStatusEnum, db, orders, profiles } from '@/lib/db'

export type AccessStatus = (typeof accessStatusEnum.enumValues)[number]
export type Role = 'admin' | 'user'

/** VIP traje 60 dana od poslednje porudžbine (CLAUDE.md: "porudžbina u poslednjih 60 dana"). */
export const VIP_WINDOW_DAYS = 60

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Čista funkcija — odlučuje access_status iz uloge i poslednje porudžbine.
 *
 * Prioritet:
 * 1. `admin` → uvek `vip` (admin nikad ne gubi pristup, čak i bez porudžbina).
 * 2. `subscriber` → ostaje `subscriber` (Faza 2 / Stripe; ova logika ga ne dira).
 * 3. Inače: porudžbina u poslednjih 60 dana → `vip`, u suprotnom `inactive`.
 */
export function resolveAccessStatus(params: {
  role: Role
  currentStatus: AccessStatus
  latestOrderDate: Date | null
  now: Date
}): AccessStatus {
  const { role, currentStatus, latestOrderDate, now } = params

  if (role === 'admin') return 'vip'
  if (currentStatus === 'subscriber') return 'subscriber'

  if (latestOrderDate && now.getTime() - latestOrderDate.getTime() <= VIP_WINDOW_DAYS * DAY_MS) {
    return 'vip'
  }
  return 'inactive'
}

/**
 * Datum poslednje (najnovije) porudžbine za dati mejl, ili `null` ako je nema.
 * Poređenje mejla je case-insensitive — `orders.email` je lowercase (sync.ts),
 * a `profiles.email` dolazi iz Clerk-a u proizvoljnom case-u.
 */
export async function getLatestOrderDate(email: string): Promise<Date | null> {
  const [row] = await db
    .select({ orderDate: orders.orderDate })
    .from(orders)
    .where(sql`lower(${orders.email}) = ${email.trim().toLowerCase()}`)
    .orderBy(desc(orders.orderDate))
    .limit(1)

  return row?.orderDate ?? null
}

type RefreshResult = { changed: boolean; status: AccessStatus }

/**
 * Osveži access_status za profil koji već imamo u ruci (login put).
 *
 * `authoritativeRole` je rola iz Clerk session claim-a (izvor istine za admina, kao middleware).
 * Ako se razlikuje od DB role, sinhronizujemo je ovde — pokriva slučaj kad `user.updated`
 * webhook nije stigao (npr. lokalni dev) pa je DB role zastareo.
 *
 * Update u bazi samo ako se role/status razlikuje. Vraća efektivni (novi) status.
 */
export async function refreshAccessStatusForProfile(
  profile: {
    id: string
    email: string
    role: Role
    accessStatus: AccessStatus
  },
  authoritativeRole?: Role,
): Promise<AccessStatus> {
  const role = authoritativeRole ?? profile.role
  const latestOrderDate = await getLatestOrderDate(profile.email)
  const next = resolveAccessStatus({
    role,
    currentStatus: profile.accessStatus,
    latestOrderDate,
    now: new Date(),
  })

  const roleChanged = role !== profile.role
  const statusChanged = next !== profile.accessStatus

  if (roleChanged || statusChanged) {
    await db
      .update(profiles)
      .set({ ...(roleChanged ? { role } : {}), ...(statusChanged ? { accessStatus: next } : {}) })
      .where(eq(profiles.id, profile.id))
  }

  return next
}

/**
 * Osveži access_status za korisnika po mejlu (webhook / backfill put).
 * Vraća `null` ako profil sa tim mejlom još ne postoji (kupac se nije registrovao —
 * status se dodeli pri registraciji, korak 1.3).
 */
export async function refreshAccessStatusForEmail(email: string): Promise<RefreshResult | null> {
  const normalized = email.trim().toLowerCase()

  const [profile] = await db
    .select({ id: profiles.id, role: profiles.role, accessStatus: profiles.accessStatus })
    .from(profiles)
    .where(sql`lower(${profiles.email}) = ${normalized}`)
    .limit(1)

  if (!profile) return null

  const latestOrderDate = await getLatestOrderDate(normalized)
  const next = resolveAccessStatus({
    role: profile.role,
    currentStatus: profile.accessStatus,
    latestOrderDate,
    now: new Date(),
  })

  if (next === profile.accessStatus) {
    return { changed: false, status: next }
  }

  await db.update(profiles).set({ accessStatus: next }).where(eq(profiles.id, profile.id))
  return { changed: true, status: next }
}

/**
 * Bulk održavanje statusa za Vercel Cron.
 * - Gasi istekle VIP-ove (vip → inactive) bez porudžbine u prozoru, izuzev admina.
 * - Vraća VIP one koji ipak imaju porudžbinu u prozoru (inactive → vip) — zaštita
 *   ako je neki webhook propušten. `subscriber` i `admin` se ne diraju ovde.
 */
export async function maintainAccessStatuses(): Promise<{ expired: number; restored: number }> {
  const cutoff = new Date(Date.now() - VIP_WINDOW_DAYS * DAY_MS)

  const hasOrderInWindow = sql`exists (
    select 1 from ${orders}
    where lower(${orders.email}) = lower(${profiles.email})
      and ${orders.orderDate} >= ${cutoff}
  )`

  const expired = await db
    .update(profiles)
    .set({ accessStatus: 'inactive' })
    .where(
      and(
        eq(profiles.accessStatus, 'vip'),
        sql`${profiles.role} <> 'admin'`,
        sql`not ${hasOrderInWindow}`,
      ),
    )
    .returning({ id: profiles.id })

  const restored = await db
    .update(profiles)
    .set({ accessStatus: 'vip' })
    .where(and(eq(profiles.accessStatus, 'inactive'), hasOrderInWindow))
    .returning({ id: profiles.id })

  return { expired: expired.length, restored: restored.length }
}
