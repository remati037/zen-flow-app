/**
 * Zameni `@clerk/nextjs/server` bezopasnim stubom — samo za QA harness.
 *
 * Zašto je neophodno: `lib/access/status.ts` (koji nosi `maintainAccessStatuses`,
 * `getLatestOrderDate`, `refreshAccessStatusForEmail` — sve upite koje harness
 * treba da izvrši) preko `lib/auth.ts` uvlači `@clerk/nextjs/server`. Taj paket
 * van Next runtime-a puca na `_react.default.createContext is not a function`,
 * pa bi bez stuba ceo taj sloj ostao netestiran.
 *
 * Zašto stub, a ne izmena produkcionog koda: jedina alternativa bila bi da se
 * Clerk uvozi lenjo u `requireActiveAccess` — izmena vruće putanje autentikacije
 * zarad testa. Stubovanje auth SDK-a u testu je standardna praksa i ne dira ništa
 * što ide u produkciju.
 *
 * Stub NE pokušava da glumi Clerk: vraća „nema sesije". Funkcije koje harness
 * vozi (`maintainAccessStatuses`, `getLatestOrderDate`, …) sesiju i ne koriste —
 * one su čisti SQL. `requireActiveAccess` je jedina koja bi je tražila i namerno
 * se ne testira ovde (pokrivena je u `qa-dates` kroz `resolveAccessStatus`).
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** Minimalan oblik koji `lib/auth.ts` očekuje od Clerk-a. */
const stub = {
  auth: async () => ({ userId: null, sessionClaims: null }),
  clerkClient: async () => ({ users: {} }),
  createRouteMatcher: () => () => false,
  clerkMiddleware: () => () => undefined,
  verifyWebhook: async () => {
    throw new Error('verifyWebhook nije dostupan u QA harness-u.')
  },
}

/**
 * Ubaci stub u `require` keš PRE nego što bilo koji modul uveze Clerk.
 *
 * tsx prevodi `.ts` fajlove u CJS (projekat nema `"type": "module"`), pa
 * `lib/auth.ts` radi `require('@clerk/nextjs/server')`. Popunjen keš znači da se
 * pravi paket nikad ne učita — a time ni React koji u njemu puca.
 *
 * Mora se pozvati pre prvog `import('../lib/...')` koji dodiruje auth.
 */
export function stubClerk(): void {
  const specifier = '@clerk/nextjs/server'
  let resolved: string
  try {
    resolved = require.resolve(specifier)
  } catch {
    // Paket nije razrešiv kao CJS — nema šta da se stubuje, pusti dalje.
    return
  }

  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: stub,
    // Ostala polja `Module`-a nikad se ne čitaju za već učitan modul.
  } as unknown as NodeJS.Module
}
