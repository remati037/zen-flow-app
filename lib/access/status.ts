import 'server-only'

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { accessWindowCutoff } from '@/lib/access/window'
import { asOverride, resolveAccessStatus, type AccessStatus, type Role } from '@/lib/access/resolve'
import { isAdmin } from '@/lib/auth'
import { BELGRADE_TZ, belgradeToday } from '@/lib/dates'
import { db, orders, profiles } from '@/lib/db'
import { SYNCED_STATUSES } from '@/lib/woocommerce/order-rules'

/**
 * Čista odluka o pristupu živi u `lib/access/resolve.ts` (bez `server-only`, da je
 * `scripts/qa-dates.mts` može voziti pod zamrznutim satom). Re-eksport je ovde da
 * pozivaoci i dalje uvoze sve sa jednog mesta.
 */
export {
  asOverride,
  resolveAccessStatus,
  type AccessOverride,
  type AccessStatus,
  type Role,
} from '@/lib/access/resolve'

/**
 * Samo validne (ne-opozvane) porudžbine daju pristup. Bez ovog filtera refundirana
 * porudžbina ostaje najnovija u `orders` i drži korisnika VIP-om punih 60 dana.
 */
const grantsAccess = inArray(orders.status, [...SYNCED_STATUSES])

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
    /** Ručni override; kad je postavljen, porudžbine se ne pitaju. */
    accessOverride?: AccessStatus | null
  },
  authoritativeRole?: Role,
): Promise<AccessStatus> {
  const role = authoritativeRole ?? profile.role
  const override = asOverride(profile.accessOverride)
  // Sa override-om porudžbina ne odlučuje ništa — preskačemo i upit.
  const latestOrderDate = override ? null : await getLatestOrderDate(profile.email)
  const next = resolveAccessStatus({
    role,
    currentStatus: profile.accessStatus,
    latestOrderDate,
    now: new Date(),
    override,
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
    .select({
      id: profiles.id,
      role: profiles.role,
      accessStatus: profiles.accessStatus,
      accessOverride: profiles.accessOverride,
    })
    .from(profiles)
    .where(sql`lower(${profiles.email}) = ${normalized}`)
    .limit(1)

  if (!profile) return null

  const override = asOverride(profile.accessOverride)
  const latestOrderDate = override ? null : await getLatestOrderDate(normalized)
  const next = resolveAccessStatus({
    role: profile.role,
    currentStatus: profile.accessStatus,
    latestOrderDate,
    now: new Date(),
    override,
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

  // Redovi sa ručnim override-om se NE diraju — to je cela poenta override-a.
  // Isti uslov mora da stoji na obe grane: bez njega bi „restore" vratio VIP nalogu
  // koji je admin namerno blokirao, čim mu istekne neka stara porudžbina u prozoru.
  const notOverridden = isNull(profiles.accessOverride)

  const expired = await db
    .update(profiles)
    .set({ accessStatus: 'inactive' })
    .where(
      and(
        eq(profiles.accessStatus, 'vip'),
        sql`${profiles.role} <> 'admin'`,
        notOverridden,
        sql`not ${hasOrderInWindow}`,
      ),
    )
    .returning({ id: profiles.id })

  const restored = await db
    .update(profiles)
    .set({ accessStatus: 'vip' })
    .where(and(eq(profiles.accessStatus, 'inactive'), notOverridden, hasOrderInWindow))
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
  accessOverride?: AccessStatus | null
}): Promise<{ allowed: boolean; status: AccessStatus }> {
  const authoritativeRole: Role = (await isAdmin()) ? 'admin' : 'user'
  const status = await refreshAccessStatusForProfile(profile, authoritativeRole)
  return { allowed: status !== 'inactive', status }
}
