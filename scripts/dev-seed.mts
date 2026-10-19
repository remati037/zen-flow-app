/**
 * Lokalni razvoj: poveži Clerk test nalog sa lokalnom bazom i napravi test podatke.
 *
 * Zašto postoji: Clerk `user.created` webhook ne može da stigne do `localhost`, pa
 * lokalno posle registracije nema `profiles` reda i app vraća na prijavu. Ova
 * skripta radi ono što bi webhook uradio + ono što bi Woo uradio (porudžbina), da
 * se ceo tok može proći lokalno bez produkcionih servisa.
 *
 * Bezbednosne ograde (skripta ODBIJA da radi inače):
 *  - `DATABASE_URL` mora biti lokalni Postgres (localhost/127.0.0.1);
 *  - `CLERK_SECRET_KEY` mora biti test ključ (`sk_test_`). Clerk API se samo ČITA
 *    (pronalaženje korisnika po mejlu) — nalog se ne pravi ni ne menja.
 *
 * Upotreba:
 *   npx tsx scripts/dev-seed.mts --email ana@primer.rs            # profil + VIP porudžbina
 *   npx tsx scripts/dev-seed.mts --email ana@primer.rs --history 6 # + 6 kompletnih dana unazad
 *   npx tsx scripts/dev-seed.mts --email ana@primer.rs --reset     # obriši sve za taj nalog
 */

import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const has = (name: string) => process.argv.includes(`--${name}`)

const email = arg('email')?.trim().toLowerCase()
if (!email) {
  console.error('Upotreba: npx tsx scripts/dev-seed.mts --email <mejl> [--history N] [--reset]')
  process.exit(1)
}

const dbUrl = process.env.DATABASE_URL ?? ''
const dbHost = (() => {
  try {
    return new URL(dbUrl).hostname
  } catch {
    return ''
  }
})()
if (!['localhost', '127.0.0.1', '::1'].includes(dbHost)) {
  console.error('❌ DATABASE_URL nije lokalni Postgres — skripta radi SAMO nad lokalnom bazom.')
  process.exit(1)
}
const clerkKey = process.env.CLERK_SECRET_KEY ?? ''
if (!clerkKey.startsWith('sk_test_')) {
  console.error('❌ CLERK_SECRET_KEY mora biti test ključ (sk_test_…).')
  process.exit(1)
}

/** Beogradski dan 'YYYY-MM-DD', pomeren za `offset` dana. */
function belgradeDay(offset = 0): string {
  const d = new Date(Date.now() + offset * 86_400_000)
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Belgrade' }).format(d)
}

const client = new pg.Client({ connectionString: dbUrl })
await client.connect()

try {
  if (has('reset')) {
    await client.query('delete from orders where lower(email) = $1', [email])
    const r = await client.query('delete from profiles where lower(email) = $1', [email])
    console.log(`🧹 Obrisano: ${r.rowCount} profil(a) i porudžbine za ${email}`)
    process.exit(0)
  }

  // Clerk user id za mejl — samo čitanje.
  // `query` pretražuje mejl, ime i id; tačno poklapanje mejla proveravamo ovde.
  const res = await fetch(
    `https://api.clerk.com/v1/users?limit=20&query=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${clerkKey}` } },
  )
  if (!res.ok) throw new Error(`Clerk API ${res.status}`)
  const users = (await res.json()) as {
    id: string
    first_name: string | null
    email_addresses: { email_address: string }[]
  }[]
  const user = users.find((u) =>
    u.email_addresses.some((e) => e.email_address.toLowerCase() === email),
  )
  if (!user) {
    console.error(`❌ U Clerk-u nema naloga sa mejlom ${email}. Prvo se registruj u app-u.`)
    process.exit(1)
  }

  await client.query(
    `insert into profiles (id, email, name, role, access_status)
     values ($1, $2, $3, 'user', 'vip')
     on conflict (id) do update set email = excluded.email`,
    [user.id, email, user.first_name],
  )
  console.log(`👤 Profil: ${user.id} (${email})`)

  // Porudžbina od pre 10 dana → VIP pristup; 2 pakovanja.
  await client.query(
    `insert into orders (woo_order_id, email, product_type, quantity_packages, capsules_total, order_date, status)
     values ($1, $2, 'full', 2, 120, now() - interval '10 days', 'completed')
     on conflict (woo_order_id) do nothing`,
    [`dev-${user.id}`, email],
  )
  console.log('🛒 Test porudžbina: 2 pakovanja, pre 10 dana (VIP)')

  const history = Number(arg('history') ?? 0)
  if (history > 0) {
    const start = belgradeDay(-history)
    await client.query(
      `update profiles set protocol_start_date = least(coalesce(protocol_start_date, $2::date), $2::date)
       where id = $1`,
      [user.id, start],
    )
    for (let i = history; i >= 1; i--) {
      const day = belgradeDay(-i)
      for (const dose of ['morning', 'evening']) {
        await client.query(
          `insert into protocol_logs (user_id, date, dose, status, taken_at)
           values ($1, $2::date, $3::dose, 'taken', now())
           on conflict (user_id, date, dose) do update set status = 'taken'`,
          [user.id, day, dose],
        )
      }
    }
    console.log(`🔥 Istorija: ${history} kompletnih dana (${start} → juče)`)
  }

  console.log('✅ Gotovo — osveži app.')
} finally {
  await client.end()
}
