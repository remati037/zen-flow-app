import { neon } from '@neondatabase/serverless'
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http'

import * as schema from './schema'

/**
 * Drizzle klijent — instancira se LENJO, pri prvom upitu.
 *
 * Zašto ne odmah (i zašto je ovo oborilo dva deploya): ranije je ovaj modul na
 * vrhu imao `if (!process.env.DATABASE_URL) throw`. `next build` u fazi
 * „Collecting page data" IMPORTUJE svaki route modul da pročita njegovu
 * konfiguraciju (`runtime`, `maxDuration`, `dynamic`), a skoro svaka ruta preko
 * lanca importa povlači i ovaj fajl. Ako `DATABASE_URL` nije prisutan u BUILD
 * okruženju, build puca sa „Failed to collect configuration for /api/...“ —
 * poruka koja optužuje rutu, a ne konfiguraciju.
 *
 * Poenta: build ne sme da zavisi od runtime tajne. Nijedna stranica ovde nema
 * `generateStaticParams` ni bilo šta što čita bazu u build fazi — baza je
 * potrebna tek kad stigne zahtev. Ista konvencija već važi za Resend
 * (`lib/email/client.ts`) i VAPID (`lib/push/send.ts`), gde je i zapisana istim
 * rečima; ovaj fajl je bio jedini koji je krši.
 *
 * Greška zbog nedostajućeg `DATABASE_URL`-a nije nestala — samo se premestila sa
 * build vremena na PRVI UPIT, gde i pripada.
 */

let instance: NeonHttpDatabase<typeof schema> | null = null

function getDb(): NeonHttpDatabase<typeof schema> {
  if (instance) return instance

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL nije postavljen. Lokalno: dodaj ga u .env.local. ' +
        'Na Vercelu: Project Settings → Environment Variables, i proveri da je uključen za ' +
        'okruženje koje deployuješ (Production I Preview, jer varijabla vezana samo za Production ' +
        'ne postoji u preview deployu).',
    )
  }

  if (process.env.NODE_ENV !== 'production' && isLocalPostgres(url)) {
    instance = createLocalDb(url)
    return instance
  }

  instance = drizzle(neon(url), { schema })
  return instance
}

/** `postgres://…@localhost` / `127.0.0.1` — lokalni Postgres, ne Neon. */
function isLocalPostgres(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

/**
 * Lokalni razvoj bez Neon-a: običan Postgres preko `pg` drajvera.
 *
 * neon-http govori HTTP protokolom koji samo Neon razume, pa lokalni Postgres
 * (Homebrew/Docker) sa njim ne radi. Drizzle `node-postgres` ima isti API za sve
 * što app koristi (`select`/`insert`/`update`/`execute` → `{ rows }`), pa ostatak
 * koda ne zna razliku. Grana postoji SAMO van produkcije: `NODE_ENV` se u build-u
 * zamenjuje konstantom, pa webpack izbacuje i ovaj poziv i `pg` iz produkcionog
 * bundle-a. Vidi README „Lokalni razvoj".
 */
function createLocalDb(url: string): NeonHttpDatabase<typeof schema> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require('pg') as typeof import('pg')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle: drizzlePg } = require('drizzle-orm/node-postgres') as typeof import('drizzle-orm/node-postgres')
  const db = drizzlePg(new Pool({ connectionString: url, max: 5 }), { schema })
  return db as unknown as NeonHttpDatabase<typeof schema>
}

/**
 * Proxy nad drizzle instancom, ne nad neon klijentom — namerno.
 *
 * Lenj NEON klijent ne bi radio: `drizzle()` na konstrukciji čita `client.query`
 * (`client.query ?? client` u neon-http sesiji), pa bi svaki proxy nad njim bio
 * probuđen već pri importu — tačno ono što izbegavamo. Odlaganje celog
 * `drizzle()` poziva nema tu zamku i ne oslanja se ni na jedan drizzle interni
 * detalj.
 *
 * Metode se vezuju za pravu instancu (`bind`) da `this` unutar drizzle-a nikad
 * ne bude proxy — inače bi privatna polja klasa čitala kroz omotač.
 * Ne-funkcije (`db.query`, `db.$client`) prolaze kakve jesu.
 */
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    const real = getDb()
    const value = Reflect.get(real, prop) as unknown
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export * from './schema'
