import 'server-only'

import { and, eq, sql } from 'drizzle-orm'

import { addDaysIso } from '@/lib/dates'
import { db, profiles, userSupplements } from '@/lib/db'
import { maskSmallGroup } from '@/lib/supplements/aggregate-rules'
import { getCatalogItem } from '@/lib/supplements/catalog'
import { FRESH_WITHIN_DAYS } from '@/lib/supplements/confirm-rules'

/** Dužina liste slobodnih unosa (admin ekran, ne izvoz). */
const LIST_LIMIT = 50

export interface StackAggregateRow {
  /** Ključ kataloga (ili sirov ključ koji je izbačen iz kataloga). */
  key: string
  label: string
  /** Korisnici sa aktivnim unosom potvrđenim u poslednjih `FRESH_WITHIN_DAYS`; `null` = „< 3". */
  freshUsers: number | null
  /** Aktivni, ali nepotvrđeni duže od toga; `null` = „< 3". */
  staleUsers: number | null
  /** Nemaskiran broj — za sortiranje i udeo na serveru, NE za prikaz. */
  rawFreshUsers: number
}

export interface CustomEntryRow {
  /** Tačno `lower(custom_name)` iz baze — ide nepromenjeno u `mergeCustomSupplement`. */
  name: string
  users: number
}

export interface StackReport {
  /** Onboardovani korisnici (imenilac za udeo). */
  onboarded: number
  /** Korisnici sa bar jednim svežim aktivnim unosom. */
  usersWithStack: number
  rows: StackAggregateRow[]
  custom: CustomEntryRow[]
}

/**
 * Zbirni pregled stack-a. Samo agregat — nijedan red ne nosi `user_id` ni mejl.
 * Efektivni ključ = kataloški ključ, inače ključ u koji je admin spojio slobodan unos,
 * inače `custom:<naziv>`. `custom:*` ključevi NISU u glavnoj tabeli (imaju svoju listu).
 *
 * `GROUP BY` ide nad kolonama CTE-a (`supp_key` je alias izračunat u `eff`), a datum granice
 * je bind parametar samo unutar agregata — nikad u `group by`.
 */
export async function getStackReport(today: string): Promise<StackReport> {
  const cutoff = addDaysIso(today, -FRESH_WITHIN_DAYS)

  const [aggregate, custom, onboardedRow, withStackRow] = await Promise.all([
    db.execute<{ supp_key: string; fresh_users: number; stale_users: number }>(sql`
      with eff as (
        select s.user_id, s.active, s.last_confirmed_on,
               coalesce(s.catalog_key, s.merged_into_key, 'custom:' || lower(s.custom_name)) as supp_key
        from ${userSupplements} s
        join ${profiles} p on p.id = s.user_id
        where p.role = 'user' and p.onboarding_completed
      ),
      per_user as (
        select user_id, supp_key,
               bool_or(active and last_confirmed_on >= ${cutoff}) as fresh,
               bool_or(active) as is_active
        from eff
        group by user_id, supp_key
      )
      select supp_key,
             (count(*) filter (where fresh))::int as fresh_users,
             (count(*) filter (where is_active and not fresh))::int as stale_users
      from per_user
      where supp_key not like 'custom:%'
      group by supp_key
      having count(*) filter (where is_active) > 0
      order by fresh_users desc, stale_users desc, supp_key
    `),
    db.execute<{ name: string; users: number }>(sql`
      select lower(s.custom_name) as name, count(distinct s.user_id)::int as users
      from ${userSupplements} s
      join ${profiles} p on p.id = s.user_id
      where s.custom_name is not null and s.merged_into_key is null and s.active
        and p.role = 'user' and p.onboarding_completed
      group by lower(s.custom_name)
      order by users desc, name
      limit ${LIST_LIMIT}
    `),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(profiles)
      .where(and(eq(profiles.role, 'user'), eq(profiles.onboardingCompleted, true))),
    db.execute<{ n: number }>(sql`
      select count(distinct s.user_id)::int as n
      from ${userSupplements} s
      join ${profiles} p on p.id = s.user_id
      where s.active and s.last_confirmed_on >= ${cutoff}
        and p.role = 'user' and p.onboarding_completed
    `),
  ])

  return {
    onboarded: onboardedRow[0]?.n ?? 0,
    usersWithStack: Number(withStackRow.rows[0]?.n ?? 0),
    rows: aggregate.rows.map((r) => ({
      key: r.supp_key,
      label: getCatalogItem(r.supp_key)?.label ?? r.supp_key,
      freshUsers: maskSmallGroup(Number(r.fresh_users)),
      staleUsers: maskSmallGroup(Number(r.stale_users)),
      rawFreshUsers: Number(r.fresh_users),
    })),
    custom: custom.rows.map((r) => ({ name: r.name, users: Number(r.users) })),
  }
}
