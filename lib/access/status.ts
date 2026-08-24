import 'server-only'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { accessWindowCutoff, isWithinAccessWindow } from '@/lib/access/window'
import { isAdmin } from '@/lib/auth'
import { BELGRADE_TZ, belgradeToday, toBelgradeIso } from '@/lib/dates'
import { accessStatusEnum, db, orders, profiles } from '@/lib/db'
import { SYNCED_STATUSES } from '@/lib/woocommerce/order-rules'

export type AccessStatus = (typeof accessStatusEnum.enumValues)[number]
export type Role = 'admin' | 'user'

/**
 * Samo validne (ne-opozvane) porudžbine daju pristup. Bez ovog filtera refundirana
 * porudžbina ostaje najnovija u `orders` i drži korisnika VIP-om punih 60 dana.
 */
const grantsAccess = inArray(orders.status, [...SYNCED_STATUSES])

/**
 * Čista funkcija — odlučuje access_status iz uloge i poslednje porudžbine.
 *
 * Prioritet:
 * 1. `admin` → uvek `vip` (admin nikad ne gubi pristup, čak i bez porudžbina).
 * 2. `subscriber` → ostaje `subscriber` (Faza 2 / Stripe; ova logika ga ne dira).
 * 3. Inače: porudžbina u prozoru pristupa → `vip`, u suprotnom `inactive`.
 *
 * Prozor se meri u beogradskim kalendarskim danima (`isWithinAccessWindow`), ne u
 * milisekundama — inače satnica porudžbine i DST prelaz pomeraju granicu za sat/dan,
 * pa se VIP gasi dok streak taj dan još smatra pokrivenim.
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

  if (latestOrderDate && isWithinAccessWindow(toBelgradeIso(latestOrderDate), toBelgradeIso(now))) {
    return 'vip'
  }
  return 'inactive'
}

/**
 * Datum poslednje (najnovije) **validne** porudžbine za dati mejl, ili `null` ako je nema.
 * Otkazane/refundirane se ne broje (`grantsAccess`).
 *
 * Poređenje mejla je case-insensitive — `orders.email` je lowercase (sync.ts),
 * a `profiles.email` dolazi iz Clerk-a u proizvoljnom case-u.
 */
export async function getLatestOrderDate(email: string): Promise<Date | null> {
  const [row] = await db
    .select({ orderDate: orders.orderDate })
    .from(orders)
    .where(and(sql`lower(${orders.email}) = ${email.trim().toLowerCase()}`, grantsAccess))
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
  // Kalendarska granica, ne `now - 60d`: `order_date` se prevodi u beogradski dan
  // pa poredi sa danom — isti obračun kao `isWithinAccessWindow` i coverage prozor.
  const cutoff = accessWindowCutoff(belgradeToday())

  const hasOrderInWindow = sql`exists (
    select 1 from ${orders}
    where lower(${orders.email}) = lower(${profiles.email})
      and (${orders.orderDate} at time zone ${BELGRADE_TZ})::date >= ${cutoff}::date
      and ${grantsAccess}
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

/**
 * Poruka koju neaktivan korisnik dobija kad direktno pozove server akciju.
 * Ista formulacija kao `/nemas-pristup` ekran — ti-forma, bez internih detalja.
 */
export const ACCESS_INACTIVE_MESSAGE =
  'Tvoj ZenFlow pristup je istekao. Obnovi porudžbinu da nastaviš protokol.'

/**
 * Server-side gejt pristupa za server akcije (S-M2).
 *
 * Zašto postoji: paywall je do sada bio SAMO `redirect` u `(app)/layout.tsx`. Redirect
 * štiti render stranice, ali server akcija je zaseban POST endpoint — neaktivan korisnik
 * je mogao da zove `logDose`, `updateSupply`, `addTask`… direktno (fetch iz konzole,
 * stari otvoren tab, ponovljen Next.js action id) i da nastavi da koristi app bez
 * važeće porudžbine.
 *
 * Namerno ide kroz `refreshAccessStatusForProfile`, a ne kroz `profile.accessStatus`
 * iz baze: DB vrednost je zastarela između cron prolaza (VIP prozor je mogao da istekne
 * pre nego što `maintainAccessStatuses` odradi posao), a rola iz Clerk claim-a je izvor
 * istine za admina. Isti izvor istine kao gejt u layout-u → nema klase gde stranica kaže
 * jedno a akcija drugo. Cena je jedan indeksiran upit nad `orders` po akciji
 * (`orders_email_lower_date_idx`).
 *
 * NE baca — vraća odluku, pa `createAction` formira uredan `ActionResult`.
 */
export async function requireActiveAccess(profile: {
  id: string
  email: string
  role: Role
  accessStatus: AccessStatus
}): Promise<{ allowed: boolean; status: AccessStatus }> {
  const authoritativeRole: Role = (await isAdmin()) ? 'admin' : 'user'
  const status = await refreshAccessStatusForProfile(profile, authoritativeRole)
  return { allowed: status !== 'inactive', status }
}
