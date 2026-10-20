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

/**
 * Upit nad ciljnom bazom. Neon HTTP drajver ne ume sa lokalnim Postgres-om — svaki
 * upit je bacao, a `catch` ispod je to prikazivao kao „objekat nedostaje", pa je
 * potpuno migrirana lokalna baza izgledala prazno. Lokalno zato ide `pg`.
 */
const host = (() => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
})()
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host)

let query: (text: string, params?: unknown[]) => Promise<unknown[]>
let close = async () => {}
if (isLocal) {
  const pg = (await import('pg')).default
  const client = new pg.Client({ connectionString: url })
  // Konekcija se otvara u prvom upitu (`select 1` ispod), da pad ide kroz istu poruku.
  let connected: Promise<unknown> | null = null
  query = async (text, params = []) => {
    connected ??= client.connect()
    await connected
    return (await client.query(text, params)).rows
  }
  close = () => client.end()
} else {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)
  query = async (text, params = []) => (await sql.query(text, params)) as unknown[]
}

// Konekcija se proverava ODMAH: bez ovoga je pogrešan URL ili ugašena baza izgledala
// kao „nedostaje svih N objekata" — tačno obrnut savet (migriraj) od pravog (popravi URL).
try {
  await query('select 1')
} catch (err) {
  // `pg` za odbijenu konekciju baca AggregateError sa praznom porukom — kod nosi razlog.
  const code = (err as { code?: string }).code
  const message = err instanceof Error && err.message ? err.message : ''
  console.error(`\nNe mogu da se povežem na bazu: ${[code, message].filter(Boolean).join(' ') || String(err)}`)
  process.exit(2)
}

const { EXPECTED_SCHEMA, describeSchemaObject, describeDatabaseTarget } = await import(
  '../lib/db/expected-schema'
)

async function exists(o: (typeof EXPECTED_SCHEMA)[number]): Promise<boolean> {
  const rows =
    o.kind === 'table'
      ? await query(`select 1 from information_schema.tables where table_schema = 'public' and table_name = $1`, [o.table])
      : o.kind === 'column'
        ? await query(
            `select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`,
            [o.table, o.column],
          )
        : await query(`select 1 from pg_indexes where schemaname = 'public' and indexname = $1`, [o.index])
  return rows.length > 0
}

console.log(`\nBaza: ${describeDatabaseTarget(url)}\n`)

// ── Tabela migracija ────────────────────────────────────────────────────────
try {
  const rows = await query('select created_at from drizzle.__drizzle_migrations order by created_at')
  console.log(`Primenjenih migracija (drizzle.__drizzle_migrations): ${rows.length}`)
} catch {
  console.log('Tabela drizzle.__drizzle_migrations NE postoji — `db:migrate` nikad nije pokrenut.')
}

// ── Stvarni objekti ─────────────────────────────────────────────────────────
console.log('\nObjekti po migraciji:')
let missing = 0
for (const item of EXPECTED_SCHEMA) {
  let ok = false
  ok = await exists(item)
  if (!ok) missing++
  console.log(`  ${ok ? '✅' : '❌'} ${item.tag}  ${describeSchemaObject(item)}`)
}

await close()

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
