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
import { fileURLToPath } from 'node:url'

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

// fileURLToPath, ne `.pathname` — pathname ostavlja `%20` za razmak u putanji checkout-a.
const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url))

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

  // ── Sprint 2: SQL koji je do sada proveravan samo JS simulacijom ──────────
  const onboarding = await import('../lib/onboarding/finalize')
  const woo = await import('../lib/woocommerce/sync')

  await inRollback('Onboarding: profil + zalihe + kviz u JEDNOJ izjavi, jednokratno', async () => {
    await seedProfile('qa_onb')
    const input = {
      userId: 'qa_onb',
      startDate: '2026-09-29',
      doseMorningTime: '08:00',
      doseEveningTime: '20:00',
      score: 42,
      quizAnswers: [3, 3, 3, 3, 3],
      capsulesRemaining: 40,
      estimatedRunoutDate: '2026-10-29',
      today: '2026-10-19',
    }
    check('prvi poziv upisuje', await onboarding.finalizeOnboarding(input), true)
    check('drugi poziv (dupli submit) ne upisuje ništa',
      await onboarding.finalizeOnboarding({ ...input, capsulesRemaining: 999 }), false)
    const [sup] = await db.select().from(schema.supply).where(eq(schema.supply.userId, 'qa_onb'))
    check('zalihe iz PRVOG poziva', sup?.capsulesRemaining, 40)
    const quiz = await db.select().from(schema.focusQuizResults).where(eq(schema.focusQuizResults.userId, 'qa_onb'))
    check('tačno jedan red kviza', quiz.length, 1)
    const [prof] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, 'qa_onb'))
    check('onboarding označen', prof?.onboardingCompleted, true)
    ok('onboarding upisuje pristanak', prof?.healthConsentAt instanceof Date, String(prof?.healthConsentAt))
  })

  const account = await import('../lib/account/store')
  await inRollback('Pristanak: upis bez pomeranja prvog trenutka', async () => {
    await seedProfile('qa_consent')
    check('upis pristanka', await account.recordHealthConsent('qa_consent'), true)
    const first = (await db.select().from(schema.profiles).where(eq(schema.profiles.id, 'qa_consent')))[0]?.healthConsentAt
    await account.recordHealthConsent('qa_consent')
    const second = (await db.select().from(schema.profiles).where(eq(schema.profiles.id, 'qa_consent')))[0]?.healthConsentAt
    check('ponovljen pristanak ne pomera trenutak', second?.toISOString(), first?.toISOString())
    check('nepostojeći profil → false', await account.recordHealthConsent('qa_nema'), false)
  })

  await inRollback('Brisanje naloga: ne ostaje nijedan red korisnika ni u jednoj tabeli', async () => {
    await seedProfile('qa_del')
    await db.insert(schema.supply).values({ userId: 'qa_del', capsulesRemaining: 10 })
    await db.insert(schema.focusQuizResults).values({ userId: 'qa_del', date: '2026-10-01', score: 40 })
    await db.insert(schema.protocolLogs).values({ userId: 'qa_del', date: '2026-10-01', dose: 'morning', status: 'taken' })
    await db.insert(schema.userSupplements).values({ userId: 'qa_del', catalogKey: 'magnesium', timeOfDay: 'morning', lastConfirmedOn: '2026-10-01' })
    await db.insert(schema.orders).values({
      wooOrderId: 'qa-del-1', email: 'qa_del@qa.local', productType: 'full',
      quantityPackages: 1, capsulesTotal: 60, orderDate: new Date('2026-10-01T10:00:00Z'), status: 'completed',
    })
    check('brisanje vraća true', await account.deleteProfileData('qa_del'), true)
    check('ponovljeno brisanje → false (idempotentno)', await account.deleteProfileData('qa_del'), false)

    const tables = await adapter.client.query(
      `select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'user_id'`,
    )
    const leftovers: string[] = []
    for (const { table_name } of tables.rows as { table_name: string }[]) {
      const res = await adapter.client.query(`select count(*)::int as n from "${table_name}" where user_id = $1`, ['qa_del'])
      if (res.rows[0].n > 0) leftovers.push(table_name)
    }
    ok('nijedna tabela sa user_id nema red obrisanog korisnika', leftovers.length === 0,
      leftovers.length ? leftovers.join(', ') : `${tables.rowCount} tabela provereno`)
    // Nova tabela sa `user_id` bez `on delete cascade` bi posle brisanja naloga ostavila
    // podatke (ili oborila brisanje FK greškom) — zato provera nad šemom, ne nad seed-om.
    const noCascade = await adapter.client.query(
      `select c.table_name from information_schema.columns c
       where c.table_schema = 'public' and c.column_name = 'user_id'
         and not exists (
           select 1 from information_schema.key_column_usage k
           join information_schema.referential_constraints rc on rc.constraint_name = k.constraint_name
           where k.table_name = c.table_name and k.column_name = 'user_id' and rc.delete_rule = 'CASCADE'
         )`,
    )
    ok('svaki user_id ima on delete cascade', noCascade.rowCount === 0,
      noCascade.rowCount ? (noCascade.rows as { table_name: string }[]).map((r) => r.table_name).join(', ') : '')
    const orderLeft = await adapter.client.query(`select count(*)::int as n from orders where woo_order_id = 'qa-del-1'`)
    check('porudžbina ostaje (evidencija prodavnice)', orderLeft.rows[0].n, 1)
  })

  const wooOrder = (id: number, email: string, createdGmt: string) => ({
    id,
    status: 'processing',
    date_created_gmt: createdGmt,
    date_paid_gmt: createdGmt,
    billing: { email },
    line_items: [{ sku: 'NURO-002', quantity: 1 }],
  })
  const capsulesOf = async (userId: string) =>
    (await db.select().from(schema.supply).where(eq(schema.supply.userId, userId)))[0]

  await inRollback('Woo top-up: delta nad tekućom vrednošću + reset epizode', async () => {
    await db.insert(schema.profiles)
      .values({ id: 'qa_woo', email: 'QA_Woo@qa.local', role: 'user', accessStatus: 'vip' })
    await db.insert(schema.supply).values({ userId: 'qa_woo', capsulesRemaining: 10, lowStockAlertsSent: 2 })
    const first = await woo.upsertOrder(wooOrder(990001, 'qa_woo@qa.local', '2026-10-18T10:00:00'))
    check('nova porudžbina → created', first.result, 'created')
    const after = await capsulesOf('qa_woo')
    check('zalihe 10 + 60 (mejl case-insensitive)', after?.capsulesRemaining, 70)
    check('epizoda niskih zaliha zatvorena', after?.lowStockAlertsSent, 0)
    ok('runout datum preračunat', after?.estimatedRunoutDate !== null, String(after?.estimatedRunoutDate))
    const again = await woo.upsertOrder(wooOrder(990001, 'qa_woo@qa.local', '2026-10-18T10:00:00'))
    check('ponovljen webhook → updated', again.result, 'updated')
    check('ponovljen webhook NE naduvava ponovo', (await capsulesOf('qa_woo'))?.capsulesRemaining, 70)
  })

  await inRollback('Backfill top-up samo za porudžbine POSLE onboardinga', async () => {
    await db.insert(schema.profiles)
      .values({ id: 'qa_bf', email: 'qa_bf@qa.local', role: 'user', accessStatus: 'vip' })
    await db.insert(schema.supply).values({ userId: 'qa_bf', capsulesRemaining: 5 })
    await db.insert(schema.focusQuizResults).values({ userId: 'qa_bf', date: '2026-08-10', score: 40 })
    await woo.upsertOrder(wooOrder(990002, 'qa_bf@qa.local', '2026-08-05T10:00:00'), { topUpSupply: 'after-onboarding' })
    check('porudžbina PRE onboardinga ne dopunjuje', (await capsulesOf('qa_bf'))?.capsulesRemaining, 5)
    await woo.upsertOrder(wooOrder(990003, 'qa_bf@qa.local', '2026-08-10T10:00:00'), { topUpSupply: 'after-onboarding' })
    check('porudžbina ISTOG dana ne dopunjuje (dvosmisleno)', (await capsulesOf('qa_bf'))?.capsulesRemaining, 5)
    await woo.upsertOrder(wooOrder(990004, 'qa_bf@qa.local', '2026-08-12T10:00:00'), { topUpSupply: 'after-onboarding' })
    check('porudžbina POSLE onboardinga dopunjuje', (await capsulesOf('qa_bf'))?.capsulesRemaining, 65)
    await woo.upsertOrder(wooOrder(990005, 'qa_bf@qa.local', '2026-08-13T10:00:00'), { topUpSupply: false })
    check('topUpSupply=false ne dopunjuje', (await capsulesOf('qa_bf'))?.capsulesRemaining, 65)
  })

  await inRollback('Woo redosled: zakasneo processing posle refund-a ne vraća pristup', async () => {
    const at = (modified: string, status: string, id = 990010) => ({
      ...wooOrder(id, 'qa_ord@qa.local', '2026-10-01T09:00:00'),
      status,
      date_modified_gmt: modified,
    })
    const statusOf = async (id: string) =>
      (await db.select().from(schema.orders).where(eq(schema.orders.wooOrderId, id)))[0]

    check('processing (10:00) → created', (await woo.upsertOrder(at('2026-10-01T10:00:00', 'processing'))).result, 'created')
    check('refund (12:00) → revoked', (await woo.upsertOrder(at('2026-10-01T12:00:00', 'refunded'))).result, 'revoked')
    const late = await woo.upsertOrder(at('2026-10-01T10:00:00', 'processing'))
    check('zakasneo processing (10:00) → skipped', late.result, 'skipped')
    check('razlog je stale', late.result === 'skipped' ? late.reason : null, 'stale')
    check('status ostaje refunded', (await statusOf('990010'))?.status, 'refunded')
    check('sačuvan trenutak poslednje izmene',
      (await statusOf('990010'))?.wooModifiedAt?.toISOString(), '2026-10-01T12:00:00.000Z')
    check('ponovljen refund (isti trenutak) → revoked', (await woo.upsertOrder(at('2026-10-01T12:00:00', 'refunded'))).result, 'revoked')
    check('payload bez date_modified ne briše trenutak',
      (await woo.upsertOrder({ ...wooOrder(990010, 'qa_ord@qa.local', '2026-10-01T09:00:00'), status: 'refunded' })).result, 'revoked')
    check('trenutak i dalje 12:00',
      (await statusOf('990010'))?.wooModifiedAt?.toISOString(), '2026-10-01T12:00:00.000Z')

    // Refund stigne PRE nego što smo ikad videli processing (webhook za processing je pao).
    check('refund nepoznate porudžbine → revoked (upisan red)', (await woo.upsertOrder(at('2026-10-02T12:00:00', 'cancelled', 990011))).result, 'revoked')
    check('red postoji kao opozvan', (await statusOf('990011'))?.status, 'cancelled')
    check('zakasneo processing nepoznate → skipped',
      (await woo.upsertOrder(at('2026-10-02T10:00:00', 'processing', 990011))).result, 'skipped')
    check('i dalje cancelled', (await statusOf('990011'))?.status, 'cancelled')

    // Opoziv bez poznatog proizvoda: samo obara status postojećeg reda, uz isti guard.
    const noSku = (modified: string, id: number) => ({
      ...at(modified, 'refunded', id), line_items: [{ sku: 'NEPOZNAT', quantity: 1 }],
    })
    check('processing 990012 → created', (await woo.upsertOrder(at('2026-10-03T10:00:00', 'processing', 990012))).result, 'created')
    check('stari refund bez SKU-a → stale', (await woo.upsertOrder(noSku('2026-10-03T09:00:00', 990012))).result === 'skipped', true)
    check('novi refund bez SKU-a → revoked', (await woo.upsertOrder(noSku('2026-10-03T11:00:00', 990012))).result, 'revoked')
    check('refund bez SKU-a nepoznate porudžbine → skipped', (await woo.upsertOrder(noSku('2026-10-03T11:00:00', 990013))).result, 'skipped')
  })

  const winback = await import('../lib/access/winback')
  await inRollback('Win-back kandidati: GROUP BY/HAVING nad pravim Postgres-om', async () => {
    const today = '2026-10-19'
    const seedLapsed = async (id: string, orderGmt: string, extra: Partial<typeof schema.profiles.$inferInsert> = {}) => {
      await db.insert(schema.profiles).values({
        id, email: `${id}@qa.local`, role: 'user', accessStatus: 'inactive', ...extra,
      })
      await db.insert(schema.orders).values({
        wooOrderId: `wb-${id}`, email: `${id}@qa.local`, productType: 'full',
        quantityPackages: 1, capsulesTotal: 60, orderDate: new Date(orderGmt), status: 'completed',
      })
    }
    // Porudžbina 2026-08-15 → istek 2026-10-14 → 5 dana posle = faza 1.
    await seedLapsed('qa_wb_1', '2026-08-15T10:00:00Z')
    // Istek pre 10 dana → faza 2.
    await seedLapsed('qa_wb_2', '2026-08-10T10:00:00Z')
    // Davno istekao → van prozora.
    await seedLapsed('qa_wb_old', '2026-03-01T10:00:00Z')
    // Admin ručno ugasio pristup → bez win-back-a.
    await seedLapsed('qa_wb_override', '2026-08-15T10:00:00Z', { accessOverride: 'inactive' })

    const found = await winback.getWinbackCandidates(today)
    const byId = new Map(found.map((c) => [c.profile.id, c]))
    check('faza 1 (5 dana posle isteka)', byId.get('qa_wb_1')?.stage, 1)
    check('poslednji dan pristupa', byId.get('qa_wb_1')?.expiryDay, '2026-10-14')
    check('faza 2 (10 dana posle isteka)', byId.get('qa_wb_2')?.stage, 2)
    check('davno istekao NIJE kandidat', byId.has('qa_wb_old'), false)
    check('ručni override NIJE kandidat', byId.has('qa_wb_override'), false)
  })

  // ── Sprint 4 ──────────────────────────────────────────────────────────────
  const record = await import('../lib/protocol/record-dose')
  const { belgradeToday: bt, addDaysIso: add } = await import('../lib/dates')
  await inRollback('recordDose: log + zalihe u JEDNOJ izjavi (double-tap, undo, prozor)', async () => {
    const today = bt()
    await db.insert(schema.profiles).values({
      id: 'qa_dose', email: 'qa_dose@qa.local', role: 'user', accessStatus: 'vip',
      onboardingCompleted: true, protocolStartDate: add(today, -3),
    })
    await db.insert(schema.supply).values({ userId: 'qa_dose', capsulesRemaining: 20 })
    const [prof] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, 'qa_dose'))
    const supplyOf = async () =>
      (await db.select().from(schema.supply).where(eq(schema.supply.userId, 'qa_dose')))[0]?.capsulesRemaining

    const first = await record.recordDose(prof!, { date: today, dose: 'morning', status: 'taken' })
    check('uzeta doza troši 2 kapsule', first.capsulesRemaining, 18)
    await record.recordDose(prof!, { date: today, dose: 'morning', status: 'taken' })
    check('double-tap ne troši ponovo', await supplyOf(), 18)
    const second = await record.recordDose(prof!, { date: today, dose: 'evening', status: 'taken' })
    check('obe doze → dan kompletan', second.streak.todayComplete, true)
    ok('bedž „prva-doza" dodeljen', first.newBadges.includes('prva-doza'), first.newBadges.join(',') || 'nijedan')
    await record.recordDose(prof!, { date: today, dose: 'evening', status: 'skipped' })
    check('undo vraća 2 kapsule', await supplyOf(), 18)
    await mustFail('dan van backfill prozora se odbija', 'poslednjih', () =>
      record.recordDose(prof!, { date: add(today, -30), dose: 'morning', status: 'taken' }),
    )
  })

  const retention = await import('../lib/admin/retention')
  await inRollback('Retencija: funnel, konverzija i liste se IZVRŠAVAJU', async () => {
    const today = '2026-10-19'
    await db.insert(schema.profiles).values({
      id: 'qa_ret', email: 'qa_ret@qa.local', role: 'user', accessStatus: 'vip', onboardingCompleted: true,
    })
    await db.insert(schema.orders).values([
      { wooOrderId: 'ret-1', email: 'qa_ret@qa.local', productType: 'full', quantityPackages: 1, capsulesTotal: 60, orderDate: new Date('2026-09-01T10:00:00Z'), status: 'completed' },
      { wooOrderId: 'ret-2', email: 'qa_ret@qa.local', productType: 'refill', quantityPackages: 1, capsulesTotal: 60, orderDate: new Date('2026-10-10T10:00:00Z'), status: 'completed' },
      { wooOrderId: 'ret-3', email: 'kupac_bez_naloga@qa.local', productType: 'full', quantityPackages: 1, capsulesTotal: 60, orderDate: new Date('2026-10-01T10:00:00Z'), status: 'processing' },
    ])
    await db.insert(schema.supply).values({ userId: 'qa_ret', capsulesRemaining: 10, estimatedRunoutDate: '2026-10-21' })
    await db.insert(schema.notificationsLog).values({
      userId: 'qa_ret', type: 'low_stock_alert', channel: 'email', status: 'success', sentAt: new Date('2026-10-05T08:00:00Z'),
    })
    const report = await retention.getRetentionReport(today)
    ok('funnel broji kupce', report.funnel.buyers >= 2, `kupaca: ${report.funnel.buyers}`)
    ok('ponovna kupovina sa app-om', report.funnel.repeatRegistered.repeat >= 1)
    ok('konverzija: porudžbina 5 dana posle alerta se broji', report.refill.converted >= 1,
      `${report.refill.converted}/${report.refill.alerted}`)
    ok('„ističu uskoro" sadrži korisnika', report.runningOut.some((r) => r.userId === 'qa_ret'))
    ok('„kupili, a nemaju nalog" sadrži kupca',
      report.unregisteredBuyers.some((r) => r.email === 'kupac_bez_naloga@qa.local'))
  })

  const focusQ = await import('../lib/focus/queries')
  await inRollback('Focus Score: GROUP BY po beogradskom danu se izvršava', async () => {
    const today = bt()
    await db.insert(schema.profiles).values({
      id: 'qa_fs', email: 'qa_fs@qa.local', role: 'user', accessStatus: 'vip',
      onboardingCompleted: true, protocolStartDate: add(today, -5), focusScoreBaseline: 40,
    })
    for (let i = 5; i >= 1; i--) {
      for (const dose of ['morning', 'evening'] as const) {
        await db.insert(schema.protocolLogs).values({ userId: 'qa_fs', date: add(today, -i), dose, status: 'taken' })
      }
    }
    await db.insert(schema.focusSessions).values({ userId: 'qa_fs', durationMin: 25, completed: true })
    const [prof] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, 'qa_fs'))
    const t = await focusQ.getFocusTrend(prof!)
    check('polazna tačka iz kviza', t.baseline, 40)
    ok('5 punih dana + blok → skor iznad polazne', t.current > 40, `skor ${t.current}`)
    check('serija od početka protokola do danas', t.points.length, 6)
  })

  // ── Moj stack ─────────────────────────────────────────────────────────────
  const stack = await import('../lib/supplements/store')
  const { belgradeToday: stkToday, addDaysIso: stkAdd } = await import('../lib/dates')

  await inRollback('Moj stack: katalog + slobodan unos, reaktivacija, case-insensitive', async () => {
    await seedProfile('qa_stk')
    const today = stkToday()
    const a = await stack.addSupplement('qa_stk', { catalogKey: 'magnesium' }, { timeOfDay: 'evening', doseNote: '400 mg' }, today)
    ok('unos iz kataloga vraća id', typeof a.id === 'number')

    const again = await stack.addSupplement('qa_stk', { catalogKey: 'magnesium' }, { timeOfDay: 'morning' }, today)
    check('isti ključ ne pravi drugi red', again.id, a.id)
    let rows = await stack.listActiveSupplements('qa_stk')
    check('i dalje jedan red', rows.length, 1)
    check('doba dana prepisano', rows[0]?.timeOfDay, 'morning')
    check('napomena o dozi prepisana (nema → null)', rows[0]?.doseNote, null)

    const c1 = await stack.addSupplement('qa_stk', { customName: 'Moj Miks' }, { timeOfDay: 'afternoon' }, today)
    const c2 = await stack.addSupplement('qa_stk', { customName: 'moj miks' }, { timeOfDay: 'afternoon' }, today)
    check('slobodan naziv je case-insensitive jedinstven', c2.id, c1.id)
    check('dva reda ukupno', (await stack.listActiveSupplements('qa_stk')).length, 2)

    // Soft delete pa ponovno dodavanje = reaktivacija ISTOG reda.
    ok('update uklanjanja uspeva', await stack.updateSupplementRow('qa_stk', a.id, { active: false }, today))
    check('uklonjen red nije u listi', (await stack.listActiveSupplements('qa_stk')).length, 1)
    const back = await stack.addSupplement('qa_stk', { catalogKey: 'magnesium' }, { timeOfDay: 'evening' }, today)
    check('reaktivacija koristi isti red', back.id, a.id)
    rows = await stack.listActiveSupplements('qa_stk')
    check('opet dva aktivna', rows.length, 2)
    const total = await db.select().from(schema.userSupplements).where(eq(schema.userSupplements.userId, 'qa_stk'))
    check('u bazi nema duplikata', total.length, 2)
  })

  await inRollback('Moj stack: dodavanje osvežava potvrdu', async () => {
    await seedProfile('qa_stk_fresh')
    const today = stkToday()
    const old = stkAdd(today, -20)
    await stack.addSupplement('qa_stk_fresh', { catalogKey: 'zinc' }, { timeOfDay: 'morning' }, old)
    check('pre dodavanja: najstarija potvrda je stara', (await stack.getStackSummary('qa_stk_fresh')).oldestConfirmedOn, old)
    await stack.addSupplement('qa_stk_fresh', { catalogKey: 'iron' }, { timeOfDay: 'morning' }, today)
    check('addSupplement osvežava potvrdu celog stack-a', (await stack.getStackSummary('qa_stk_fresh')).oldestConfirmedOn, today)
    check('clearStack i dalje briše sve', await stack.clearStack('qa_stk_fresh'), 2)
    check('posle clearStack: prazan summary', (await stack.getStackSummary('qa_stk_fresh')).activeCount, 0)
  })

  await inRollback('Moj stack: ograničenja baze', async () => {
    await seedProfile('qa_stk_c')
    const today = stkToday()
    const base = { userId: 'qa_stk_c', timeOfDay: 'morning' as const, lastConfirmedOn: today }
    await mustFailInSavepoint('oba imena odjednom → CHECK', 'user_supplements_one_name', () =>
      db.insert(schema.userSupplements).values({ ...base, catalogKey: 'zinc', customName: 'Cink' }),
    )
    await mustFailInSavepoint('nijedno ime → CHECK', 'user_supplements_one_name', () =>
      db.insert(schema.userSupplements).values({ ...base }),
    )
    await mustFailInSavepoint('spajanje kataloškog reda → CHECK', 'user_supplements_merge_custom_only', () =>
      db.insert(schema.userSupplements).values({ ...base, catalogKey: 'zinc', mergedIntoKey: 'magnesium' }),
    )
    await mustFailInSavepoint('isti kataloški ključ dvaput → unique', 'user_supplements_user_catalog_uq', async () => {
      await db.insert(schema.userSupplements).values({ ...base, catalogKey: 'zinc' })
      await db.insert(schema.userSupplements).values({ ...base, catalogKey: 'zinc' })
    })
  })

  await inRollback('Moj stack: izmena je vezana za vlasnika; potvrda; brisanje', async () => {
    await seedProfile('qa_stk_a')
    await seedProfile('qa_stk_b')
    const today = stkToday()
    const old = stkAdd(today, -20)
    const mine = await stack.addSupplement('qa_stk_a', { catalogKey: 'zinc' }, { timeOfDay: 'morning' }, old)
    const theirs = await stack.addSupplement('qa_stk_b', { catalogKey: 'zinc' }, { timeOfDay: 'morning' }, old)

    check('tuđ red se ne menja', await stack.updateSupplementRow('qa_stk_a', theirs.id, { timeOfDay: 'evening' }, today), false)
    const [other] = await db.select().from(schema.userSupplements).where(eq(schema.userSupplements.id, theirs.id))
    check('tuđ red je netaknut', other?.timeOfDay, 'morning')

    let s = await stack.getStackSummary('qa_stk_a')
    check('summary: broj aktivnih', s.activeCount, 1)
    check('summary: najstariji datum je string', s.oldestConfirmedOn, old)

    ok('sopstveni update uspeva', await stack.updateSupplementRow('qa_stk_a', mine.id, { doseNote: '15 mg' }, today))
    s = await stack.getStackSummary('qa_stk_a')
    check('svaka izmena liste osvežava potvrdu', s.oldestConfirmedOn, today)
    const [theirsAfter] = await db.select().from(schema.userSupplements).where(eq(schema.userSupplements.id, theirs.id))
    check('potvrda tuđeg stack-a ostaje stara', theirsAfter?.lastConfirmedOn, old)

    check('prazan update vraća false', await stack.updateSupplementRow('qa_stk_a', mine.id, {}, today), false)
    check('doseNote se briše sa null', (await stack.updateSupplementRow('qa_stk_a', mine.id, { doseNote: null }, today)), true)
    const [noNote] = await db.select().from(schema.userSupplements).where(eq(schema.userSupplements.id, mine.id))
    check('doseNote je stvarno null u bazi', noNote?.doseNote, null)
    check('prazan stack: summary.activeCount 0', (await stack.getStackSummary('qa_stk_c_nema')).activeCount, 0)
    check('prazan stack: oldestConfirmedOn null', (await stack.getStackSummary('qa_stk_c_nema')).oldestConfirmedOn, null)

    await db.update(schema.userSupplements).set({ lastConfirmedOn: old }).where(eq(schema.userSupplements.id, mine.id))
    check('confirmStack vraća broj aktivnih', await stack.confirmStack('qa_stk_a', today), 1)
    check('confirmStack postavlja današnji dan', (await stack.getStackSummary('qa_stk_a')).oldestConfirmedOn, today)

    const inactiveRow = await stack.addSupplement('qa_stk_a', { customName: 'Neaktivan unos' }, { timeOfDay: 'evening' }, old)
    await stack.updateSupplementRow('qa_stk_a', inactiveRow.id, { active: false }, old)
    await db.update(schema.userSupplements).set({ lastConfirmedOn: old }).where(eq(schema.userSupplements.id, inactiveRow.id))
    await stack.confirmStack('qa_stk_a', today)
    const [inactiveAfter] = await db.select().from(schema.userSupplements).where(eq(schema.userSupplements.id, inactiveRow.id))
    check('confirmStack ne dira neaktivan red', inactiveAfter?.lastConfirmedOn, old)

    check('clearStack briše samo svoje (i neaktivne)', await stack.clearStack('qa_stk_a'), 2)
    check('moj stack prazan', (await stack.listActiveSupplements('qa_stk_a')).length, 0)
    check('tuđ stack ostaje', (await stack.listActiveSupplements('qa_stk_b')).length, 1)
  })

  await inRollback('Moj stack: brisanje profila briše stack (CASCADE)', async () => {
    await seedProfile('qa_stk_del')
    await stack.addSupplement('qa_stk_del', { catalogKey: 'iron' }, { timeOfDay: 'morning' }, stkToday())
    await db.delete(schema.profiles).where(eq(schema.profiles.id, 'qa_stk_del'))
    const left = await db.select().from(schema.userSupplements).where(eq(schema.userSupplements.userId, 'qa_stk_del'))
    check('redovi nestaju sa profilom', left.length, 0)
  })

  await inRollback('Moj stack: gornja granica unosa', async () => {
    await seedProfile('qa_stk_cap')
    const today = stkToday()
    let firstId = 0
    for (let i = 0; i < stack.MAX_SUPPLEMENTS_PER_USER; i++) {
      const r = await stack.addSupplement('qa_stk_cap', { customName: `Unos broj ${i}` }, { timeOfDay: 'morning' }, today)
      if (i === 0) firstId = r.id
    }
    await mustFail('unos preko granice se odbija', 'Stack je pun', () =>
      stack.addSupplement('qa_stk_cap', { customName: 'Jedan previše' }, { timeOfDay: 'morning' }, today),
    )
    ok('uklanjanje unosa (active=false) uspeva', await stack.updateSupplementRow('qa_stk_cap', firstId, { active: false }, today))
    const freed = await stack.addSupplement('qa_stk_cap', { customName: 'Oslobođeno mesto' }, { timeOfDay: 'morning' }, today)
    ok('uklonjen unos oslobađa mesto (granica broji samo aktivne)', freed.id > 0)
    await mustFail('ponovno aktiviranje uklonjenog unosa na punom stack-u se odbija', 'Stack je pun', () =>
      stack.addSupplement('qa_stk_cap', { customName: 'Unos broj 0' }, { timeOfDay: 'morning' }, today),
    )
  })

  await inRollback('Moj stack: spajanje slobodnog unosa sa katalogom', async () => {
    await seedProfile('qa_stk_m1')
    await seedProfile('qa_stk_m2')
    const today = stkToday()
    await stack.addSupplement('qa_stk_m1', { customName: 'Mg tablete' }, { timeOfDay: 'evening' }, today)
    await stack.addSupplement('qa_stk_m2', { customName: 'MG TABLETE' }, { timeOfDay: 'evening' }, today)
    check('spajanje pogađa oba reda (lower())', await stack.mergeCustomSupplement('mg tablete', 'magnesium'), 2)
    const merged = await db.select().from(schema.userSupplements).where(eq(schema.userSupplements.mergedIntoKey, 'magnesium'))
    check('oba reda imaju merged_into_key', merged.length, 2)
    check('korisnikov originalni unos je netaknut', merged.some((r) => r.customName === 'Mg tablete'), true)
    check('poništavanje spajanja (null)', await stack.mergeCustomSupplement('mg tablete', null), 2)
    check('nepostojeći naziv → 0 redova', await stack.mergeCustomSupplement('nema takvog', 'zinc'), 0)
  })

  const stackAdmin = await import('../lib/admin/stack')
  await inRollback('Admin stack: agregat po ključu, spajanje, zastareli, prag malih grupa', async () => {
    const today = stkToday()
    const stale = stkAdd(today, -60)
    const before = await stackAdmin.getStackReport(today)
    await db
      .insert(schema.profiles)
      .values({ id: 'qa_sa_admin', email: 'qa_sa_admin@qa.local', role: 'admin', accessStatus: 'vip', onboardingCompleted: true })
      .onConflictDoNothing()
    for (const id of ['qa_sa1', 'qa_sa2', 'qa_sa3', 'qa_sa4', 'qa_sa5', 'qa_sa6']) {
      await db
        .insert(schema.profiles)
        .values({ id, email: `${id}@qa.local`, role: 'user', accessStatus: 'vip', onboardingCompleted: true })
        .onConflictDoNothing()
    }
    // magnesium: 3 svežih (jedan preko slobodnog unosa koji admin spaja) + 1 zastareo
    await stack.addSupplement('qa_sa1', { catalogKey: 'magnesium' }, { timeOfDay: 'evening' }, today)
    await stack.addSupplement('qa_sa2', { catalogKey: 'magnesium' }, { timeOfDay: 'evening' }, today)
    await stack.addSupplement('qa_sa3', { customName: 'Mg tablete' }, { timeOfDay: 'evening' }, today)
    await stack.addSupplement('qa_sa4', { catalogKey: 'magnesium' }, { timeOfDay: 'evening' }, stale)
    // zinc: samo 2 sveža → maskirano
    await stack.addSupplement('qa_sa1', { catalogKey: 'zinc' }, { timeOfDay: 'morning' }, today)
    await stack.addSupplement('qa_sa2', { catalogKey: 'zinc' }, { timeOfDay: 'morning' }, today)
    // neaktivan unos ne ulazi nigde
    const gone = await stack.addSupplement('qa_sa5', { catalogKey: 'iron' }, { timeOfDay: 'morning' }, today)
    await stack.updateSupplementRow('qa_sa5', gone.id, { active: false }, today)
    // nespojen slobodan unos
    await stack.addSupplement('qa_sa6', { customName: 'Ekstrakt X' }, { timeOfDay: 'morning' }, today)

    // Admin sa magnezijumom i slobodnim unosom NE ulazi ni u agregat ni u listu slobodnih.
    await stack.addSupplement('qa_sa_admin', { catalogKey: 'magnesium' }, { timeOfDay: 'evening' }, today)
    await stack.addSupplement('qa_sa_admin', { customName: 'Admin Miks' }, { timeOfDay: 'evening' }, today)

    let report = await stackAdmin.getStackReport(today)
    check('admin ne menja broj magnezijuma', report.rows.find((r) => r.key === 'magnesium')?.rawFreshUsers, 2)
    check('admin ne ulazi u listu slobodnih', report.custom.some((c) => c.name === 'admin miks'), false)
    const mag = report.rows.find((r) => r.key === 'magnesium')
    check('pre spajanja: magnezijum sveži = 2 (maskirano)', mag?.freshUsers, null)
    check('pre spajanja: sirov broj svežih = 2', mag?.rawFreshUsers, 2)
    check('zastareo se broji zasebno (1 → maskirano)', mag?.staleUsers, null)
    check('lista slobodnih sadrži „mg tablete" sa 1', report.custom.find((c) => c.name === 'mg tablete')?.users, 1)
    ok('slobodni unosi NISU u tabeli po suplementu', !report.rows.some((r) => r.key.startsWith('custom:')))

    await stack.mergeCustomSupplement('mg tablete', 'magnesium')
    report = await stackAdmin.getStackReport(today)
    const mag2 = report.rows.find((r) => r.key === 'magnesium')
    check('posle spajanja: magnezijum sveži = 3 (vidljivo)', mag2?.freshUsers, 3)
    check('posle spajanja: nestaje iz liste slobodnih', report.custom.some((c) => c.name === 'mg tablete'), false)
    check('label dolazi iz kataloga', mag2?.label, 'Magnezijum')
    check('zinc sa 2 korisnika je maskiran', report.rows.find((r) => r.key === 'zinc')?.freshUsers, null)
    check('neaktivan gvožđe ne ulazi', report.rows.some((r) => r.key === 'iron'), false)
    check('nespojen unos ostaje u listi', report.custom.find((c) => c.name === 'ekstrakt x')?.users, 1)
    check('onboardovani: tačno +6', report.onboarded - before.onboarded, 6)
    check('korisnika sa svežim stack-om: tačno +4 (sa1, sa2, sa3, sa6; bez sa4 zastarelog i sa5 neaktivnog)', report.usersWithStack - before.usersWithStack, 4)
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
