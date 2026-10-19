import 'server-only'

import { sql } from 'drizzle-orm'

import { ACCESS_WINDOW_DAYS, accessWindowCutoff } from '@/lib/access/window'
import { BELGRADE_TZ, addDaysIso } from '@/lib/dates'
import { db, notificationsLog, orders, profiles, protocolLogs, supply } from '@/lib/db'
import { LOW_STOCK_THRESHOLD } from '@/lib/protocol/dosing'
import { SYNCED_STATUSES } from '@/lib/woocommerce/order-rules'

/**
 * Retencioni pregled za admina — odgovara na pitanje „da li app vraća kupce".
 *
 * Sve se računa u SQL-u (agregati), bez učitavanja redova po korisniku. Zona ide
 * kao SQL literal (`sql.raw`), ne bind parametar — isti razlog kao u
 * `lib/admin/delivery.ts`; konstanta je naša, nikad korisnički unos.
 */
const tz = sql.raw(`'${BELGRADE_TZ}'`)
const validStatuses = sql.join(
  SYNCED_STATUSES.map((s) => sql`${s}`),
  sql`, `,
)

/** Koliko dana unapred lista „ističu uskoro" gleda procenjeni datum isteka. */
export const RUNNING_OUT_DAYS = 5
/** Prozor u kom se porudžbina posle low-stock alerta računa kao konverzija. */
export const REFILL_CONVERSION_DAYS = 7
/** Koliko unazad gledamo low-stock alerte za konverziju. */
export const REFILL_LOOKBACK_DAYS = 30
/** Aktivan = bar jedna uzeta doza u poslednjih N dana. */
export const ACTIVE_DAYS = 7
/** Dužina liste za akciju (admin ekran, ne izvoz). */
const LIST_LIMIT = 50

export interface RetentionFunnel {
  /** Različiti mejlovi sa bar jednom važećom porudžbinom. */
  buyers: number
  /** Kupci koji imaju nalog u app-u. */
  registered: number
  /** Registrovani koji su završili onboarding. */
  onboarded: number
  /** Onboardovani sa uzetom dozom u poslednjih `ACTIVE_DAYS` dana. */
  active: number
  /** Ponovna kupovina (≥ 2 važeće porudžbine) — registrovani u app-u. */
  repeatRegistered: { repeat: number; of: number }
  /** Ponovna kupovina — kupci BEZ naloga. Poređenje pokazuje da li app vraća kupce. */
  repeatUnregistered: { repeat: number; of: number }
}

export interface RefillConversion {
  /** Korisnici koji su dobili low-stock alert u poslednjih `REFILL_LOOKBACK_DAYS` dana. */
  alerted: number
  /** Od njih: važeća porudžbina u `REFILL_CONVERSION_DAYS` dana posle PRVOG alerta. */
  converted: number
}

export interface RunningOutRow {
  userId: string
  email: string
  name: string | null
  capsulesRemaining: number
  estimatedRunoutDate: string | null
}

export interface LapsedRow {
  userId: string
  email: string
  name: string | null
  /** Poslednji dan pristupa (ISO). */
  expiredOn: string
}

export interface UnregisteredBuyerRow {
  email: string
  /** Poslednja važeća porudžbina (ISO, beogradski dan). */
  lastOrderDay: string
}

export interface RetentionReport {
  funnel: RetentionFunnel
  refill: RefillConversion
  runningOut: RunningOutRow[]
  lapsed: LapsedRow[]
  unregisteredBuyers: UnregisteredBuyerRow[]
}

export async function getRetentionReport(today: string): Promise<RetentionReport> {
  const [funnel, refill, runningOut, lapsed, unregisteredBuyers] = await Promise.all([
    getFunnel(today),
    getRefillConversion(today),
    getRunningOut(today),
    getLapsed(today),
    getUnregisteredBuyers(today),
  ])
  return { funnel, refill, runningOut, lapsed, unregisteredBuyers }
}

export async function getFunnel(today: string): Promise<RetentionFunnel> {
  const activeSince = addDaysIso(today, -(ACTIVE_DAYS - 1))
  const result = await db.execute<{
    buyers: number
    registered: number
    onboarded: number
    active: number
    repeat_registered: number
    repeat_unregistered: number
  }>(sql`
    with buyer as (
      select lower(${orders.email}) as email, count(*)::int as orders
      from ${orders}
      where ${orders.status} in (${validStatuses})
      group by 1
    ),
    joined as (
      select b.email, b.orders, p.id as user_id, p.onboarding_completed
      from buyer b
      left join ${profiles} p on lower(p.email) = b.email and p.role = 'user'
    )
    select
      count(*)::int as buyers,
      count(user_id)::int as registered,
      count(*) filter (where onboarding_completed)::int as onboarded,
      count(*) filter (where onboarding_completed and exists (
        select 1 from ${protocolLogs} l
        where l.user_id = joined.user_id
          and l.status = 'taken'
          and l.date >= ${activeSince}::date
      ))::int as active,
      count(*) filter (where user_id is not null and orders >= 2)::int as repeat_registered,
      count(*) filter (where user_id is null and orders >= 2)::int as repeat_unregistered
    from joined
  `)
  const r = result.rows[0]
  const buyers = Number(r?.buyers ?? 0)
  const registered = Number(r?.registered ?? 0)
  return {
    buyers,
    registered,
    onboarded: Number(r?.onboarded ?? 0),
    active: Number(r?.active ?? 0),
    repeatRegistered: { repeat: Number(r?.repeat_registered ?? 0), of: registered },
    repeatUnregistered: { repeat: Number(r?.repeat_unregistered ?? 0), of: buyers - registered },
  }
}

export async function getRefillConversion(today: string): Promise<RefillConversion> {
  const since = addDaysIso(today, -REFILL_LOOKBACK_DAYS)
  const result = await db.execute<{ alerted: number; converted: number }>(sql`
    with first_alert as (
      select ${notificationsLog.userId} as user_id, min(${notificationsLog.sentAt}) as at
      from ${notificationsLog}
      where ${notificationsLog.type} = 'low_stock_alert'
        and ${notificationsLog.status} = 'success'
        and (${notificationsLog.sentAt} at time zone ${tz})::date >= ${since}::date
      group by 1
    )
    select
      count(*)::int as alerted,
      count(*) filter (where exists (
        select 1 from ${orders} o
        join ${profiles} p on lower(p.email) = lower(o.email)
        where p.id = first_alert.user_id
          and o.status in (${validStatuses})
          and o.order_date >= first_alert.at
          and o.order_date < first_alert.at + make_interval(days => ${REFILL_CONVERSION_DAYS}::int)
      ))::int as converted
    from first_alert
  `)
  const r = result.rows[0]
  return { alerted: Number(r?.alerted ?? 0), converted: Number(r?.converted ?? 0) }
}

/** Aktivni korisnici kojima zalihe ističu u narednih `RUNNING_OUT_DAYS` dana (ili su ispod praga). */
export async function getRunningOut(today: string): Promise<RunningOutRow[]> {
  const horizon = addDaysIso(today, RUNNING_OUT_DAYS)
  const result = await db.execute<{
    user_id: string
    email: string
    name: string | null
    capsules_remaining: number
    estimated_runout_date: string | null
  }>(sql`
    select p.id as user_id, p.email, p.name, s.capsules_remaining,
           s.estimated_runout_date::text as estimated_runout_date
    from ${supply} s
    join ${profiles} p on p.id = s.user_id
    where p.access_status <> 'inactive'
      and p.role = 'user'
      and (s.capsules_remaining <= ${LOW_STOCK_THRESHOLD}::int
           or s.estimated_runout_date <= ${horizon}::date)
    order by s.estimated_runout_date asc nulls last, s.capsules_remaining asc
    limit ${LIST_LIMIT}
  `)
  return result.rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    name: r.name,
    capsulesRemaining: Number(r.capsules_remaining),
    estimatedRunoutDate: r.estimated_runout_date,
  }))
}

/** Kupci kojima je pristup istekao u poslednjih 28 dana — ciljna grupa win-back-a. */
export async function getLapsed(today: string): Promise<LapsedRow[]> {
  // Istek = poslednja porudžbina + 60 dana ∈ [today − 27, today − 1]
  const newestOrderDay = addDaysIso(today, -ACCESS_WINDOW_DAYS - 1)
  const oldestOrderDay = addDaysIso(today, -ACCESS_WINDOW_DAYS - 27)
  const result = await db.execute<{
    user_id: string
    email: string
    name: string | null
    last_order_day: string
  }>(sql`
    select p.id as user_id, p.email, p.name,
           (max(o.order_date) at time zone ${tz})::date::text as last_order_day
    from ${profiles} p
    join ${orders} o on lower(o.email) = lower(p.email) and o.status in (${validStatuses})
    where p.access_status = 'inactive' and p.role = 'user' and p.access_override is null
    group by p.id
    having (max(o.order_date) at time zone ${tz})::date
      between ${oldestOrderDay}::date and ${newestOrderDay}::date
    order by 4 desc
    limit ${LIST_LIMIT}
  `)
  return result.rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    name: r.name,
    expiredOn: addDaysIso(r.last_order_day, ACCESS_WINDOW_DAYS),
  }))
}

/** Važeći kupci u prozoru pristupa koji NEMAJU nalog — imaju pravo na app, a ne koriste ga. */
export async function getUnregisteredBuyers(today: string): Promise<UnregisteredBuyerRow[]> {
  const cutoff = accessWindowCutoff(today)
  const result = await db.execute<{ email: string; last_order_day: string }>(sql`
    select lower(o.email) as email,
           (max(o.order_date) at time zone ${tz})::date::text as last_order_day
    from ${orders} o
    where o.status in (${validStatuses})
      and not exists (select 1 from ${profiles} p where lower(p.email) = lower(o.email))
    group by 1
    having (max(o.order_date) at time zone ${tz})::date >= ${cutoff}::date
    order by 2 desc
    limit ${LIST_LIMIT}
  `)
  return result.rows.map((r) => ({ email: r.email, lastOrderDay: r.last_order_day }))
}
