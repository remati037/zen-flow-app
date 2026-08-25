import { sql } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { requireCronAuth } from '@/lib/cron/auth'
import { db } from '@/lib/db'
import {
  EXPECTED_SCHEMA,
  describeDatabaseTarget,
  describeSchemaObject,
} from '@/lib/db/expected-schema'

export const runtime = 'nodejs'

/**
 * Stanje šeme na bazi na koju je APLIKACIJA stvarno spojena (read-only).
 *
 * Postoji zbog konkretnog incidenta: migracije su bile primenjene, ali na drugu
 * bazu od one koju produkcija koristi (`drizzle.config.ts` čita `.env.local`, tj.
 * dev branch). Spolja se to ne razlikuje ni od čega — svaka ruta samo vrati 500
 * bez tela, jer Next ne otkriva poruku izuzetka. `scripts/db-status.mts` gleda
 * bazu koju MU zadaš; ova ruta gleda bazu koju vidi PRODUKCIJA. Tek to dvoje
 * zajedno razlikuje „nije migrirano" od „migrirano na pogrešnu bazu".
 *
 * Ne otkriva tajne: iz connection stringa ide samo host i ime baze, nikad
 * kredencijali. Zaštićena `CRON_SECRET`-om kao i ostale cron rute.
 *
 * STROGO read-only — samo `information_schema` / `pg_indexes`.
 *
 * Pokretanje:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://app.nurolab.rs/api/cron/db-check
 */
export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const target = describeDatabaseTarget(process.env.DATABASE_URL)

  // Svaka provera ide u svoj `try`: cilj je da se vidi ŠTA nedostaje, a ne da
  // prva greška sakrije ostatak izveštaja.
  const objects: { tag: string; what: string; exists: boolean; error?: string }[] = []
  for (const o of EXPECTED_SCHEMA) {
    const what = describeSchemaObject(o)
    try {
      const query =
        o.kind === 'table'
          ? sql`select 1 from information_schema.tables where table_schema = 'public' and table_name = ${o.table}`
          : o.kind === 'column'
            ? sql`select 1 from information_schema.columns where table_schema = 'public' and table_name = ${o.table} and column_name = ${o.column}`
            : sql`select 1 from pg_indexes where schemaname = 'public' and indexname = ${o.index}`
      const res = await db.execute(query)
      objects.push({ tag: o.tag, what, exists: res.rows.length > 0 })
    } catch (err) {
      objects.push({
        tag: o.tag,
        what,
        exists: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  let migrationsApplied: number | null = null
  let migrationsError: string | null = null
  try {
    const res = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    )
    migrationsApplied = Number(res.rows[0]?.n ?? 0)
  } catch (err) {
    migrationsError = err instanceof Error ? err.message : String(err)
  }

  // Dokaz da je konekcija sama po sebi živa — razlikuje „baza nedostupna" od
  // „baza je tu, ali joj fale kolone".
  let connectionOk = false
  let connectionError: string | null = null
  try {
    await db.execute(sql`select 1`)
    connectionOk = true
  } catch (err) {
    connectionError = err instanceof Error ? err.message : String(err)
  }

  const missing = objects.filter((o) => !o.exists)

  return NextResponse.json({
    database: target,
    connectionOk,
    connectionError,
    migrationsApplied,
    migrationsError,
    missingCount: missing.length,
    missing: missing.map((m) => `${m.tag} · ${m.what}`),
    objects,
  })
}
