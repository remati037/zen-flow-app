/**
 * Stanje šeme na JEDNOJ bazi — koje su migracije primenjene i postoje li objekti
 * koje one uvode.
 *
 * Postoji zbog konkretnog produkcionog otkaza: `drizzle.config.ts` učitava
 * `.env.local`, a to je DEV Neon branch. `npm run db:migrate` zato migrira dev,
 * i lako se poveruje da je i produkcija migrirana — dok aplikacija na produkciji
 * ne počne da 500-uje na svaki upit, jer kod traži kolone kojih tamo nema.
 *
 * Skripta je STROGO read-only: samo `select`. Ništa ne menja.
 *
 * Pokretanje:
 *   npx tsx scripts/db-status.mts                        # baza iz .env.local (dev)
 *   DATABASE_URL="<prod pooled url>" npx tsx scripts/db-status.mts
 *
 * Napomena: `dotenv` NE pregazi već postojeću varijablu, pa prefiks u komandi
 * pobeđuje nad `.env.local`. Skripta svejedno ispisuje na koji host je spojena —
 * pogrešna baza je cela poenta ovog alata i ne sme da se pogađa.
 */

import { config } from 'dotenv'

config({ path: '.env.local' })

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL nije postavljen (ni u okruženju ni u .env.local).')
  process.exit(1)
}

const { neon } = await import('@neondatabase/serverless')
const sql = neon(url)

const { EXPECTED_SCHEMA, describeSchemaObject, describeDatabaseTarget } = await import(
  '../lib/db/expected-schema'
)

async function exists(o: (typeof EXPECTED_SCHEMA)[number]): Promise<boolean> {
  const rows = (await (o.kind === 'table'
    ? sql`select 1 from information_schema.tables where table_schema = 'public' and table_name = ${o.table}`
    : o.kind === 'column'
      ? sql`select 1 from information_schema.columns where table_schema = 'public' and table_name = ${o.table} and column_name = ${o.column}`
      : sql`select 1 from pg_indexes where schemaname = 'public' and indexname = ${o.index}`)) as unknown[]
  return rows.length > 0
}

console.log(`\nBaza: ${describeDatabaseTarget(url)}\n`)

// ── Tabela migracija ────────────────────────────────────────────────────────
try {
  const rows = (await sql`
    select created_at from drizzle.__drizzle_migrations order by created_at
  `) as { created_at: string }[]
  console.log(`Primenjenih migracija (drizzle.__drizzle_migrations): ${rows.length}`)
} catch {
  console.log('Tabela drizzle.__drizzle_migrations NE postoji — `db:migrate` nikad nije pokrenut.')
}

// ── Stvarni objekti ─────────────────────────────────────────────────────────
console.log('\nObjekti po migraciji:')
let missing = 0
for (const item of EXPECTED_SCHEMA) {
  let ok = false
  try {
    ok = await exists(item)
  } catch {
    ok = false
  }
  if (!ok) missing++
  console.log(`  ${ok ? '✅' : '❌'} ${item.tag}  ${describeSchemaObject(item)}`)
}

console.log('\n──────────────')
if (missing === 0) {
  console.log('Šema je kompletna — kod i baza se poklapaju.\n')
  process.exit(0)
}

console.log(`NEDOSTAJE ${missing} objekat/objekata.`)
console.log('Aplikacija će 500-ovati na svaki upit koji ih dodiruje.')
console.log('\nPrimeni migracije NA OVU bazu:')
console.log('  DATABASE_URL="<isti url>" npx drizzle-kit migrate\n')
process.exit(1)
