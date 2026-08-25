/**
 * Preusmeri neon-http saobraćaj na OBIČAN Postgres preko `pg`.
 *
 * Zašto ovo postoji: aplikacija svuda koristi `db` iz `lib/db` (drizzle preko
 * neon-http), koji upite šalje HTTP-om ka Neon-u. Da bi QA harness mogao da vozi
 * **prave funkcije aplikacije** — a ne njihove prepisane kopije, koje se vremenom
 * neizbežno raziđu od originala — mora da postoji način da te iste funkcije
 * pogode lokalnu bazu. `neonConfig.fetchFunction` je zvanična kuka za to.
 *
 * Alternativa (docker proxy `local-neon-http-proxy`) traži third-party image u
 * CI-ju; ovo je ~60 linija bez ijedne dodatne zavisnosti u lancu.
 *
 * Zašto se presreće GLOBALNI `fetch`, a ne `neonConfig.fetchFunction`: tsx
 * `lib/db/index.ts` (`.ts`, bez `"type": "module"`) prevodi u CJS, a ovaj fajl
 * (`.mts`) ostaje ESM — pa se `@neondatabase/serverless` učita DVA puta i svaka
 * kopija ima svoj `neonConfig`. Postavljanje na jednu kopiju driver u drugoj ne
 * vidi (provereno: `fetchFunction` je bio postavljen, a `queryCount` ostao 0).
 * Driver poziva `(fetchFunction ?? fetch)(...)`, pa zakrpa nad globalnim `fetch`-om
 * hvata sve kopije. Saobraćaj ka drugim hostovima prolazi netaknut.
 *
 * Protokol koji driver očekuje (iz `@neondatabase/serverless`):
 *  - zahtev:  POST sa JSON telom `{ query, params }`, uz zaglavlja
 *    `Neon-Raw-Text-Output: true` i `Neon-Array-Mode: true`
 *  - odgovor: `{ fields: [{ name, dataTypeID }], rows: [[...]], rowCount, command }`,
 *    gde su vrednosti SIROVI stringovi — driver sam primenjuje pg parsere po
 *    `dataTypeID`. Zato `pg` ovde mora da vrati neparsirane vrednosti
 *    (`types.getTypeParser` → identitet), inače bi se parsiranje desilo dvaput.
 *  - greška:  HTTP 400 sa `{ message, code, severity, ... }` → driver od toga
 *    pravi `NeonDbError`, isti tip greške koji bi stigao i sa produkcije.
 */

import { Client } from 'pg'

/** Polja Postgres greške koja driver preslikava na `NeonDbError`. */
const PG_ERROR_FIELDS = [
  'code',
  'severity',
  'detail',
  'hint',
  'position',
  'where',
  'schema',
  'table',
  'column',
  'constraint',
] as const

export type NeonPgAdapter = {
  /** `pg` klijent — harness ga koristi za BEGIN/ROLLBACK oko svakog testa. */
  client: Client
  /** Broj upita koji je prošao kroz adapter (sanity provera da se stvarno koristi). */
  queryCount: () => number
  close: () => Promise<void>
}

/**
 * Zaglavlje po kom se prepoznaje Neon SQL zahtev.
 *
 * Filtriranje po URL-u ne radi: `neonConfig.fetchEndpoint` transformiše host
 * (`ep-…neon.tech` → `api.…/sql`), pa lažni host iz `DATABASE_URL`-a u krajnjem
 * URL-u više ne postoji. Zaglavlje šalje sam driver uz SVAKI upit i ne zavisi ni
 * od jedne konfiguracije — sve ostalo prolazi netaknuto pravim `fetch`-om.
 */
const NEON_HEADER = 'neon-connection-string'

/** Zaglavlja stižu kao `Headers`, niz parova ili običan objekat — pokrij sve. */
function hasNeonHeader(headers: HeadersInit | undefined): boolean {
  if (!headers) return false
  if (headers instanceof Headers) return headers.has(NEON_HEADER)
  if (Array.isArray(headers)) return headers.some(([k]) => k.toLowerCase() === NEON_HEADER)
  return Object.keys(headers).some((k) => k.toLowerCase() === NEON_HEADER)
}

export async function installNeonPgAdapter(connectionString: string): Promise<NeonPgAdapter> {
  const client = new Client({
    connectionString,
    // Neon preko TCP-a traži SSL; lokalni Postgres u CI-ju ga nema. `rejectUnauthorized`
    // je isključen jer je ovo test konekcija ka bazi koju sami podižemo.
    ssl: /neon\.tech/.test(connectionString) ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()

  let count = 0
  const realFetch = globalThis.fetch

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!hasNeonHeader(init?.headers)) return realFetch(input, init)

    const body = JSON.parse(String(init?.body ?? '{}')) as
      | { query: string; params?: unknown[] }
      | { queries: { query: string; params?: unknown[] }[] }

    if ('queries' in body) {
      // Batch (`db.batch`) — aplikacija ga ne koristi (neon-http nema transakcije,
      // vidi CLAUDE.md). Bolje glasno pući nego tiho vratiti pogrešan oblik.
      return jsonResponse({ message: 'Batch upiti nisu podržani u QA adapteru.' }, 400)
    }

    count++
    try {
      const res = await client.query({
        text: body.query,
        values: body.params ?? [],
        // Driver traži `Neon-Array-Mode` + `Neon-Raw-Text-Output`: redovi kao nizovi,
        // vrednosti kao sirovi tekst. Parsiranje je posao drivera, ne naš.
        rowMode: 'array',
        types: { getTypeParser: () => (v: unknown) => v },
      })

      return jsonResponse({
        fields: res.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
        rows: res.rows,
        rowCount: res.rowCount,
        command: res.command,
      })
    } catch (err) {
      const e = err as Record<string, unknown> & { message?: string }
      const payload: Record<string, unknown> = { message: e.message ?? String(err) }
      for (const field of PG_ERROR_FIELDS) payload[field] = e[field]
      // 400 je jedini status koji driver razlaže u `NeonDbError` sa poljima;
      // sve ostalo bi stiglo kao gola poruka i izgubilo `code`/`constraint`.
      return jsonResponse(payload, 400)
    }
  }) as typeof fetch

  return {
    client,
    queryCount: () => count,
    close: async () => {
      globalThis.fetch = realFetch
      await client.end()
    },
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
