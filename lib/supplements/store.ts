import 'server-only'

import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'

import { ActionError } from '@/lib/actions/types'
import { db, userSupplements } from '@/lib/db'
import type { StackRow } from './types'
import type { TimeOfDay } from './time-of-day'

/**
 * Sav SQL „Mog stack-a" na jednom mestu — akcije su tanke, a `qa-sql` izvršava OVE funkcije.
 *
 * Granica broji samo AKTIVNE unose (uklonjen unos oslobađa mesto; ponovno aktiviranje
 * računa se kao dodavanje). Nije invarijanta (check-then-act): paralelan unos sme da
 * prekorači granicu za koji red, što je prihvatljivo — granica brani od zloupotrebe,
 * ne od greške u računu.
 */
export const MAX_SUPPLEMENTS_PER_USER = 60

export type SupplementTarget = { catalogKey: string } | { customName: string }

export async function listActiveSupplements(userId: string): Promise<StackRow[]> {
  return db
    .select({
      id: userSupplements.id,
      catalogKey: userSupplements.catalogKey,
      customName: userSupplements.customName,
      timeOfDay: userSupplements.timeOfDay,
      doseNote: userSupplements.doseNote,
    })
    .from(userSupplements)
    .where(and(eq(userSupplements.userId, userId), eq(userSupplements.active, true)))
    .orderBy(asc(userSupplements.createdAt), asc(userSupplements.id))
}

/**
 * Upis je JEDNA izjava. Isti suplement (kataloški ključ ili slobodan naziv, case-insensitive)
 * REAKTIVIRA postojeći red i prepisuje doba dana/napomenu — jedinstveni indeksi ne
 * dozvoljavaju drugi. `on conflict` mora da ponovi predikat odgovarajućeg indeksa.
 */
export async function addSupplement(
  userId: string,
  target: SupplementTarget,
  fields: { timeOfDay: TimeOfDay; doseNote?: string },
  today: string,
): Promise<{ id: number }> {
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userSupplements)
    .where(and(eq(userSupplements.userId, userId), eq(userSupplements.active, true)))
  if ((count?.n ?? 0) >= MAX_SUPPLEMENTS_PER_USER) {
    throw new ActionError(`Stack je pun (najviše ${MAX_SUPPLEMENTS_PER_USER} unosa).`)
  }

  const doseNote = fields.doseNote ?? null
  const result =
    'catalogKey' in target
      ? await db.execute<{ id: number }>(sql`
          insert into ${userSupplements} (user_id, catalog_key, time_of_day, dose_note, last_confirmed_on)
          values (${userId}, ${target.catalogKey}, ${fields.timeOfDay}, ${doseNote}, ${today})
          on conflict (user_id, catalog_key) where catalog_key is not null
          do update set active = true,
                        time_of_day = excluded.time_of_day,
                        dose_note = excluded.dose_note,
                        last_confirmed_on = excluded.last_confirmed_on
          returning id`)
      : await db.execute<{ id: number }>(sql`
          insert into ${userSupplements} (user_id, custom_name, time_of_day, dose_note, last_confirmed_on)
          values (${userId}, ${target.customName}, ${fields.timeOfDay}, ${doseNote}, ${today})
          on conflict (user_id, lower(custom_name)) where custom_name is not null
          do update set active = true,
                        custom_name = excluded.custom_name,
                        time_of_day = excluded.time_of_day,
                        dose_note = excluded.dose_note,
                        last_confirmed_on = excluded.last_confirmed_on
          returning id`)

  const row = result.rows[0]
  if (!row) throw new Error('addSupplement: upis nije vratio red')
  return { id: Number(row.id) }
}

/** `false` kad red ne postoji ili nije korisnikov (ili nema nijedne izmene). */
export async function updateSupplementRow(
  userId: string,
  id: number,
  patch: { timeOfDay?: TimeOfDay; doseNote?: string | null; active?: boolean },
  today: string,
): Promise<boolean> {
  const set: Partial<typeof userSupplements.$inferInsert> = {}
  if (patch.timeOfDay !== undefined) set.timeOfDay = patch.timeOfDay
  if (patch.doseNote !== undefined) set.doseNote = patch.doseNote
  if (patch.active !== undefined) set.active = patch.active
  if (Object.keys(set).length === 0) return false

  const rows = await db
    .update(userSupplements)
    .set(set)
    .where(and(eq(userSupplements.id, id), eq(userSupplements.userId, userId)))
    .returning({ id: userSupplements.id })
  if (rows.length === 0) return false

  // Korisnik koji je upravo uredio stack ne treba da dobije karticu „da li je isti".
  await confirmStack(userId, today)
  return true
}

/** „Isti je": potvrđuje sve aktivne redove danas. Vraća broj potvrđenih. */
export async function confirmStack(userId: string, today: string): Promise<number> {
  const rows = await db
    .update(userSupplements)
    .set({ lastConfirmedOn: today })
    .where(and(eq(userSupplements.userId, userId), eq(userSupplements.active, true)))
    .returning({ id: userSupplements.id })
  return rows.length
}

export async function clearStack(userId: string): Promise<number> {
  const rows = await db
    .delete(userSupplements)
    .where(eq(userSupplements.userId, userId))
    .returning({ id: userSupplements.id })
  return rows.length
}

/** Ulaz za `needsConfirmation`: broj aktivnih i najstariji datum potvrde među njima. */
export async function getStackSummary(
  userId: string,
): Promise<{ activeCount: number; oldestConfirmedOn: string | null }> {
  const [row] = await db
    .select({
      activeCount: sql<number>`count(*)::int`,
      // `::text` — pg adapter bi inače vratio Date, neon-http string.
      oldestConfirmedOn: sql<string | null>`min(${userSupplements.lastConfirmedOn})::text`,
    })
    .from(userSupplements)
    .where(and(eq(userSupplements.userId, userId), eq(userSupplements.active, true)))
  return { activeCount: row?.activeCount ?? 0, oldestConfirmedOn: row?.oldestConfirmedOn ?? null }
}

/**
 * Admin: spaja slobodan unos sa ključem kataloga (ili poništava spajanje sa `null`).
 * `name` je tačno ono što vrati `lower(custom_name)` u admin listi — NE lowercase-uje se u JS-u,
 * jer `lower()` u Postgres-u zavisi od locale-a baze i dve strane moraju da se slažu.
 */
export async function mergeCustomSupplement(name: string, intoKey: string | null): Promise<number> {
  const rows = await db
    .update(userSupplements)
    .set({ mergedIntoKey: intoKey })
    .where(
      and(
        isNotNull(userSupplements.customName),
        sql`lower(${userSupplements.customName}) = ${name}`,
      ),
    )
    .returning({ id: userSupplements.id })
  return rows.length
}
