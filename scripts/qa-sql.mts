/**
 * QA harness — SQL koji se STVARNO IZVRŠAVA.
 *
 * Postoji zbog dva produkciona otkaza koja su prošla kroz lint, build, `qa-dates`
 * (218 provera) i `qa-routes` (50) potpuno netaknuta:
 *
 *  1. `getDeliveryReport` je zonu slao kao bind parametar, pa je isti izraz u
 *     `select` listi dobio `$1`, a u `group by` `$4`. Postgres ih ne prepoznaje
 *     kao isti izraz i odbija upit. Kod se uredno kompajlira — puca tek pri
 *     izvršavanju. Obaralo je `/admin` i `/api/cron/daily-report`.
 *  2. Produkcijska baza je bila na migraciji `0000`, a kod je tražio kolone iz
 *     `0001`–`0004`. Svaka ruta je vraćala prazan 500.
 *
 * Zajedničko im je da ih NIJEDNA provera nad čistim funkcijama ne može uhvatiti:
 * prvi zahteva pravi Postgres koji odbije upit, drugi zahteva poređenje koda sa
 * pravom bazom. Zato ovaj harness vozi PRAVE funkcije aplikacije (ne prepisane
 * kopije, koje se vremenom raziđu) nad pravim Postgres-om.
 *
 * Kako prave funkcije uopšte rade van Next-a:
 *  - `--conditions=react-server` propušta `import 'server-only'` čuvare;
 *  - `scripts/lib/neon-pg-adapter.mts` preusmerava neon-http saobraćaj na `pg`.
 *
 * Pokretanje:
 *   TEST_DATABASE_URL="postgres://..." npx tsx --conditions=react-server scripts/qa-sql.mts
 *
 * BEZBEDNOST: namerno se NE oslanja na `DATABASE_URL`. Traži zaseban
 * `TEST_DATABASE_URL` da se harness koji upisuje podatke nikad ne pokrene nad
 * dev ili produkcijskom bazom iz nepažnje. Uz to, svaki test koji piše je omotan
 * u `BEGIN`/`ROLLBACK` nad istom `pg` konekcijom, pa ne ostavlja trag.
 *
 * Bez `TEST_DATABASE_URL`: offline deo se izvrši, DB deo se PRESKAČE (lokalno,
 * exit 0), osim u CI-ju (`CI=true`), gde nedostatak baze obara harness.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let pass = 0
let fail = 0
let skipped = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log(`  ✅ ${label} → ${a}`)
  } else {
    fail++
    console.log(`  ❌ ${label} → ${a}  (očekivano ${e})`)
  }
}

function ok(label: string, condition: boolean, detail = '') {
  if (condition) {
    pass++
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Poruka greške + `cause`.
 *
 * Drizzle svaki neuspeh omota u „Failed query: <sql>", a PRAVI razlog (npr.
 * „column ... must appear in the GROUP BY clause") stoji u `cause`. Bez ovoga
 * harness prijavi da je nešto palo, ali ne i zašto — a zašto je cela vrednost.
 */
function explain(err: unknown): string {
  const parts: string[] = []
  if (err instanceof Error) {
    parts.push(err.message)
    const cause = (err as { cause?: unknown }).cause
    if (cause instanceof Error) parts.push(`cause: ${cause.message}`)
    else if (cause) parts.push(`cause: ${String(cause)}`)
  } else {
    parts.push(String(err))
  }
  return parts.join(' | ')
}

/** Upit MORA da prođe kroz Postgres. Greška se ispisuje cela — ona je poenta. */
async function mustRun(label: string, run: () => Promise<unknown>) {
  try {
    const result = await run()
    pass++
    const preview =
      Array.isArray(result) ? `${result.length} redova` : result === undefined ? 'ok' : 'ok'
    console.log(`  ✅ ${label} — ${preview}`)
    return result
  } catch (err) {
    fail++
    console.log(`  ❌ ${label}`)
    console.log(`     ${explain(err)}`)
    return null
  }
}

/** Upit MORA da padne — i to sa očekivanim razlogom (npr. CHECK ograničenje). */
async function mustFail(label: string, expectFragment: string, run: () => Promise<unknown>) {
  try {
    await run()
    fail++
    console.log(`  ❌ ${label} — upit je PROŠAO, a morao je da padne`)
  } catch (err) {
    const msg = explain(err)
    if (msg.toLowerCase().includes(expectFragment.toLowerCase())) {
      pass++
      console.log(`  ✅ ${label} — odbijeno: ${expectFragment}`)
    } else {
      fail++
      console.log(`  ❌ ${label} — pao iz POGREŠNOG razloga: ${msg}`)
    }
  }
}

const MIGRATIONS_DIR = new URL('../drizzle', import.meta.url).pathname

// ════════════════════════════════════════════════════════════════════════════
// DEO 1 — offline: migracije i dijagnostički spisak (ne treba baza)
// ════════════════════════════════════════════════════════════════════════════

console.log('\n=== 1. Migracije na disku ===')

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

ok('postoji bar jedna migracija', migrationFiles.length > 0, `${migrationFiles.length} fajlova`)

const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')) as {
  entries: { idx: number; tag: string }[]
}

// Journal koji se raziđe sa diskom znači da `db:migrate` ili preskoči migraciju
// ili pokuša da primeni fajl kojeg nema — oba ishoda se vide tek na bazi.
check('journal ima isti broj unosa kao .sql fajlova', journal.entries.length, migrationFiles.length)
for (const entry of journal.entries) {
  ok(`journal unos ${entry.idx} ima fajl na disku`, migrationFiles.includes(`${entry.tag}.sql`), entry.tag)
}

console.log('\n=== 2. Dijagnostički spisak prati migracije ===')
// `EXPECTED_SCHEMA` nosi `/api/cron/db-check` i `scripts/db-status.mts`. Ako neko
// doda migraciju a ne dopuni spisak, dijagnostika tiho prestane da vidi nove
// objekte — a baš je ta dijagnostika ono što je otkrilo produkcioni incident.
const { EXPECTED_SCHEMA } = await import('../lib/db/expected-schema')

const declaredColumns = new Set(
  EXPECTED_SCHEMA.filter((o) => o.kind === 'column').map((o) => `${o.table}.${o.column}`),
)
const declaredTables = new Set(EXPECTED_SCHEMA.filter((o) => o.kind === 'table').map((o) => o.table))
const declaredIndexes = new Set(EXPECTED_SCHEMA.filter((o) => o.kind === 'index').map((o) => o.index))

// Migracija 0000 je bazna šema — nju spisak namerno ne nabraja (sve bi bilo u njoj).
const laterMigrations = migrationFiles.filter((f) => !f.startsWith('0000'))

for (const file of laterMigrations) {
  const sqlText = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')

  for (const m of sqlText.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/gi)) {
    const key = `${m[1]}.${m[2]}`
    ok(`${file}: ${key} je u EXPECTED_SCHEMA`, declaredColumns.has(key))
  }
  for (const m of sqlText.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"(\w+)"/gi)) {
    ok(`${file}: tabela ${m[1]} je u EXPECTED_SCHEMA`, declaredTables.has(m[1]))
  }
  for (const m of sqlText.matchAll(/CREATE (?:UNIQUE )?INDEX "(\w+)"/gi)) {
    ok(`${file}: index ${m[1]} je u EXPECTED_SCHEMA`, declaredIndexes.has(m[1]))
  }
}

// ════════════════════════════════════════════════════════════════════════════
// DEO 2 — izvršavanje nad pravim Postgres-om
// ════════════════════════════════════════════════════════════════════════════

const testUrl = process.env.TEST_DATABASE_URL

if (!testUrl) {
  const inCi = process.env.CI === 'true'
  console.log('\n=== 3–7. Izvršavanje nad bazom ===')
  if (inCi) {
    console.log('  ❌ TEST_DATABASE_URL nije postavljen, a CI=true — baza je OBAVEZNA u CI-ju.')
    fail++
  } else {
    console.log('  ⏭️  TEST_DATABASE_URL nije postavljen — DB deo preskočen.')
    console.log('     Lokalno: docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=qa --name zenflow-qa postgres:17')
    console.log('     pa: TEST_DATABASE_URL="postgres://postgres:qa@localhost:5433/postgres" \\')
    console.log('         npx tsx --conditions=react-server scripts/qa-sql.mts')
    skipped++
  }
  report()
}

// `lib/db` traži DATABASE_URL da napravi klijenta. Adapter presreće saobraćaj pre
// nego što ijedan bajt ode na mrežu, pa je ova vrednost samo sintaksno validan URL.
process.env.DATABASE_URL = 'postgresql://qa:qa@qa.neon.tech/qa?sslmode=require'

// Clerk mora biti stubovan PRE prvog importa koji ga uvlači (`lib/access/status`).
const { stubClerk } = await import('./lib/stub-clerk.mjs')
stubClerk()

const { installNeonPgAdapter } = await import('./lib/neon-pg-adapter.mjs')
const adapter = await installNeonPgAdapter(testUrl!)

try {
  await runDatabaseChecks()
} finally {
  await adapter.close()
}

report()

// ────────────────────────────────────────────────────────────────────────────

async function runDatabaseChecks() {
  const { sql, eq } = await import('drizzle-orm')
  const { getTableConfig } = await import('drizzle-orm/pg-core')
  const dbModule = await import('../lib/db')
  const { db } = dbModule
  const { describeSchemaObject } = await import('../lib/db/expected-schema')

  console.log('\n=== 3. Šema: migracije primenjene ===')

  // Sveža baza (CI): primeni migracije. Već pripremljena: preskoči.
  const applied = await adapter.client
    .query('select count(*)::int as n from drizzle.__drizzle_migrations')
    .then((r) => Number(r.rows[0].n))
    .catch(() => -1)

  if (applied <= 0) {
    console.log(`  ℹ️  Baza je prazna — primenjujem ${migrationFiles.length} migracija.`)
    await adapter.client.query('create schema if not exists drizzle')
    await adapter.client.query(
      'create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)',
    )
    for (const file of migrationFiles) {
      const sqlText = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      // Drizzle razdvaja izjave ovim markerom; `;` nije dovoljan jer se javlja i
      // unutar tela funkcija i u string literalima.
      for (const statement of sqlText.split('--> statement-breakpoint')) {
        const trimmed = statement.trim()
        if (trimmed) await adapter.client.query(trimmed)
      }
      await adapter.client.query(
        'insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)',
        [file, Date.now()],
      )
    }
    ok('sve migracije primenjene bez greške', true, `${migrationFiles.length} fajlova`)
  } else {
    ok('baza je već migrirana', true, `${applied} migracija`)
  }

  console.log('\n=== 4. Šema: dijagnostički spisak postoji u bazi ===')
  const { EXPECTED_SCHEMA: expected } = await import('../lib/db/expected-schema')
  for (const o of expected) {
    const exists = await objectExists(o)
    ok(describeSchemaObject(o), exists, o.tag)
  }

  // Moduli se uvoze jednom, van transakcionih blokova — `import` ne sme da zavisi
  // od toga da li je neki test u toku.
  const dedup = await import('../lib/push/dedup')
  const heartbeat = await import('../lib/cron/heartbeat')

  console.log('\n=== 5. Drift: SVAKA kolona iz drizzle šeme postoji u bazi ===')
  // Ovo je generička verzija provere koja je nedostajala kad je produkcija ostala
  // na `0000`: ne nabraja se ručno šta se očekuje, nego se cela drizzle šema
  // poredi sa `information_schema`. Nova kolona u kodu bez migracije pada OVDE.
  const schema = await import('../lib/db/schema')
  const liveColumns = await adapter.client.query<{ table_name: string; column_name: string; is_nullable: string }>(
    `select table_name, column_name, is_nullable
     from information_schema.columns where table_schema = 'public'`,
  )
  const live = new Map(
    liveColumns.rows.map((r) => [`${r.table_name}.${r.column_name}`, r.is_nullable === 'YES']),
  )

  let driftChecked = 0
  let driftMissing = 0
  const nullabilityMismatch: string[] = []

  for (const value of Object.values(schema)) {
    // Samo pgTable objekti — relacije i enumi nemaju konfiguraciju tabele.
    let config: ReturnType<typeof getTableConfig>
    try {
      config = getTableConfig(value as never)
    } catch {
      continue
    }
    for (const column of config.columns) {
      const key = `${config.name}.${column.name}`
      driftChecked++
      if (!live.has(key)) {
        driftMissing++
        console.log(`  ❌ ${key} — kod je traži, u bazi je NEMA`)
        continue
      }
      // `notNull` u kodu, a nullable u bazi → insert bez vrednosti prolazi u bazi
      // a TypeScript tvrdi suprotno; obrnuto → validan insert puca u runtime-u.
      const dbNullable = live.get(key)!
      if (column.notNull === dbNullable) {
        nullabilityMismatch.push(`${key} (kod: ${column.notNull ? 'NOT NULL' : 'nullable'})`)
      }
    }
  }
  ok('sve kolone iz drizzle šeme postoje u bazi', driftMissing === 0, `provereno ${driftChecked}`)
  ok('nullability se poklapa', nullabilityMismatch.length === 0, nullabilityMismatch.join(', ') || 'bez odstupanja')

  console.log('\n=== 6. Prave funkcije aplikacije se IZVRŠAVAJU ===')
  // Svaka od ovih je pucala ili je mogla da pukne samo pri izvršavanju.
  // `getDeliveryReport` je direktna regresija za GROUP BY bug.
  //
  // Ceo blok ide u transakciju koja se vraća unazad: `maintainAccessStatuses`
  // radi `UPDATE` nad `profiles`. Bez ovoga bi harness pokrenut nad bazom sa
  // podacima menjao tuđe statuse pristupa — a harness ne sme da ima nuspojave.
  await inRollback('izvršavanje pravih funkcija', runRealFunctions)

  async function runRealFunctions() {
  const delivery = await import('../lib/admin/delivery')
  await mustRun('getDeliveryReport() — GROUP BY po beogradskom danu', () => delivery.getDeliveryReport())
  await mustRun('getDeliveryReport(1) — jednodnevni prozor', () => delivery.getDeliveryReport(1))

  const metrics = await import('../lib/admin/metrics')
  await mustRun('getAdminMetrics() — svi agregati', () => metrics.getAdminMetrics())

  const users = await import('../lib/admin/users')
  await mustRun('listAdminUsers() — bez pretrage', () => users.listAdminUsers())
  // `%` i `_` su LIKE metaznaci: bez escape-a pretraga vraća SVE redove.
  await mustRun('listAdminUsers("%") — escape LIKE metaznaka', () => users.listAdminUsers('%'))
  await mustRun('listAdminUsers("_") — escape LIKE metaznaka', () => users.listAdminUsers('_'))
  await mustRun('listAdminUsers("a\\\\b") — escape backslash-a', () => users.listAdminUsers('a\\b'))

  const access = await import('../lib/access/status')
  await mustRun('getLatestOrderDate() — funkcionalni indeks lower(email)', () =>
    access.getLatestOrderDate('Neko@Primer.rs'),
  )
  await mustRun('maintainAccessStatuses() — correlated EXISTS + isNull(override)', () =>
    access.maintainAccessStatuses(),
  )
  await mustRun('refreshAccessStatusForEmail() — nepostojeći profil', () =>
    access.refreshAccessStatusForEmail('nepostojeci@primer.rs'),
  )

  await mustRun('filterNotifiedSince() — prazan skup', () =>
    dedup.filterNotifiedSince({ userIds: [], type: 'dose_reminder_morning', since: new Date(0) }),
  )
  await mustRun('filterNotifiedSince() — sa korisnicima', () =>
    dedup.filterNotifiedSince({
      userIds: ['qa_user_1', 'qa_user_2'],
      type: 'dose_reminder_morning',
      since: new Date(0),
      channel: 'push',
    }),
  )
  await mustRun('hasEverNotified()', () => dedup.hasEverNotified('qa_user_1', 'welcome', 'email'))
  await mustRun('wasNotifiedToday()', () => dedup.wasNotifiedToday('qa_user_1', 'low_stock_alert', 'push'))

  await mustRun('readCronRun() — nepostojeći posao', () => heartbeat.readCronRun('notifications'))
  }

  console.log('\n=== 7. Ograničenja i atomarnost (u transakciji, bez traga) ===')

  await inRollback('CHECK: access_override sme samo vip/inactive', async () => {
    await seedProfile('qa_check')
    // SAVEPOINT: prekršaj ograničenja ostavlja transakciju u „aborted" stanju, pa
    // bi svaki sledeći upit padao sa „current transaction is aborted" — što bi
    // izgledalo kao dodatni bug umesto kao očekivano ponašanje Postgres-a.
    await mustFailInSavepoint(
      'access_override = "subscriber" mora biti odbijen',
      'profiles_access_override_values',
      () =>
        db
          .update(schema.profiles)
          .set({ accessOverride: 'subscriber' })
          .where(eq(schema.profiles.id, 'qa_check')),
    )
    await mustRun('access_override = "vip" prolazi', () =>
      db
        .update(schema.profiles)
        .set({ accessOverride: 'vip' })
        .where(eq(schema.profiles.id, 'qa_check')),
    )
  })

  await inRollback('Dedup je REZERVACIJA, ne provera', async () => {
    await seedProfile('qa_dedup')
    const first = await dedup.claimNotification({
      userId: 'qa_dedup',
      type: 'dose_reminder_morning',
      channel: 'push',
      day: '2026-08-25',
    })
    const second = await dedup.claimNotification({
      userId: 'qa_dedup',
      type: 'dose_reminder_morning',
      channel: 'push',
      day: '2026-08-25',
    })
    ok('prva rezervacija uspeva', first !== null, `id ${first}`)
    check('druga rezervacija ISTOG dana vraća null', second, null)

    // Drugi kanal je nezavisan — mejl ne sme da pojede push slot.
    const email = await dedup.claimNotification({
      userId: 'qa_dedup',
      type: 'dose_reminder_morning',
      channel: 'email',
      day: '2026-08-25',
    })
    ok('drugi KANAL dobija svoj slot', email !== null)

    // Neuspelo slanje oslobađa dan (`dedup_day = null`), pa sledeći run sme ponovo.
    await dedup.settleNotification(first!, false)
    const retry = await dedup.claimNotification({
      userId: 'qa_dedup',
      type: 'dose_reminder_morning',
      channel: 'push',
      day: '2026-08-25',
    })
    ok('posle neuspeha slot je opet slobodan', retry !== null)

    // Uspeh ga TROŠI.
    await dedup.settleNotification(retry!, true)
    const afterSuccess = await dedup.claimNotification({
      userId: 'qa_dedup',
      type: 'dose_reminder_morning',
      channel: 'push',
      day: '2026-08-25',
    })
    check('posle uspeha slot ostaje potrošen', afterSuccess, null)
  })

  await inRollback('Heartbeat meri rupu u SQL-u', async () => {
    const first = await heartbeat.recordCronRun('notifications', { qa: true })
    ok('prvi run nema rupu', first?.gapMin === null, `gapMin=${first?.gapMin}`)
    const second = await heartbeat.recordCronRun('notifications', { qa: true })
    ok('drugi run ima izmerenu rupu', typeof second?.gapMin === 'number', `gapMin=${second?.gapMin}`)
    check('runsTotal raste', second?.runsTotal, 2)
  })

  await inRollback('Low-stock cap: kolona postoji i broji', async () => {
    await seedProfile('qa_supply')
    await db.insert(schema.supply).values({ userId: 'qa_supply', capsulesRemaining: 10 })
    await db
      .update(schema.supply)
      .set({ lowStockAlertsSent: sql`${schema.supply.lowStockAlertsSent} + 1` })
      .where(eq(schema.supply.userId, 'qa_supply'))
    const [row] = await db
      .select({ n: schema.supply.lowStockAlertsSent })
      .from(schema.supply)
      .where(eq(schema.supply.userId, 'qa_supply'))
    check('SQL delta nad tekućom vrednošću', row?.n, 1)
  })

  ok('adapter je stvarno korišćen', adapter.queryCount() > 0, `${adapter.queryCount()} upita kroz pg`)

  // ── pomoćne ───────────────────────────────────────────────────────────────

  async function objectExists(o: (typeof expected)[number]): Promise<boolean> {
    const q =
      o.kind === 'table'
        ? [`select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [o.table]]
        : o.kind === 'column'
          ? [
              `select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
              [o.table, o.column],
            ]
          : [`select 1 from pg_indexes where schemaname='public' and indexname=$1`, [o.index]]
    const res = await adapter.client.query(q[0] as string, q[1] as unknown[])
    return res.rowCount! > 0
  }

  /**
   * `mustFail` unutar transakcije — omotan u SAVEPOINT.
   *
   * Postgres posle prekršaja ograničenja odbija SVE do kraja transakcije. Bez
   * savepoint-a bi jedan namerni prekršaj oborio i sve provere posle njega.
   */
  async function mustFailInSavepoint(label: string, expectFragment: string, run: () => Promise<unknown>) {
    await adapter.client.query('SAVEPOINT qa_expected_failure')
    await mustFail(label, expectFragment, run)
    await adapter.client.query('ROLLBACK TO SAVEPOINT qa_expected_failure')
  }

  /** Minimalan profil — FK cilj za supply/notifications_log. */
  async function seedProfile(id: string) {
    await db
      .insert(schema.profiles)
      .values({ id, email: `${id}@qa.local`, role: 'user', accessStatus: 'vip' })
      .onConflictDoNothing()
  }

  /**
   * Test koji PIŠE ide u transakciju koja se uvek vrati unazad.
   *
   * Adapter drži JEDNU `pg` konekciju, pa `BEGIN` ovde obuhvata i sve upite koje
   * u međuvremenu pošalje drizzle kroz neon-http. Zato harness sme da se pokrene
   * i nad bazom sa podacima, a da ništa ne ostavi za sobom.
   */
  async function inRollback(label: string, body: () => Promise<void>) {
    console.log(`  · ${label}`)
    await adapter.client.query('BEGIN')
    try {
      await body()
    } catch (err) {
      fail++
      console.log(`  ❌ ${label} — ${explain(err)}`)
    } finally {
      await adapter.client.query('ROLLBACK')
    }
  }
}

function report(): never {
  const tail = skipped > 0 ? `, ${skipped} preskočeno` : ''
  console.log(`\n──────────────\nRezultat: ${pass} prošlo, ${fail} palo${tail}\n`)
  process.exit(fail > 0 ? 1 : 0)
}
