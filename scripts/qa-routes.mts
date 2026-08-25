/**
 * QA harness — klasifikacija ruta u middleware-u.
 *
 * Postoji zbog konkretnog produkcionog bug-a: cron rute nisu bile u
 * `PUBLIC_ROUTES`, pa ih je `auth.protect()` presretao i Clerk je za ne-HTML
 * zahteve vraćao **404**. Scheduler i Vercel Cron su mesecima tiho dobijali
 * "ruta ne postoji" umesto 401 — podsetnici, low-stock alerti i osvežavanje
 * pristupa nisu radili nijednom.
 *
 * Pokretanje: npx tsx scripts/qa-routes.mts
 */

import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { createRouteMatcher } from '@clerk/nextjs/server'

import { ADMIN_ROUTES, PUBLIC_ROUTES } from '../lib/route-config'

const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTES])
const isAdminRoute = createRouteMatcher([...ADMIN_ROUTES])

/** Clerk matcher čita samo `req.nextUrl.pathname` — dovoljan je minimalan stub. */
const req = (pathname: string) => ({ nextUrl: { pathname } }) as never

let pass = 0
let fail = 0

function check(path: string, wantPublic: boolean, wantAdmin: boolean, why: string) {
  const gotPublic = isPublicRoute(req(path))
  const gotAdmin = isAdminRoute(req(path))
  const ok = gotPublic === wantPublic && gotAdmin === wantAdmin
  if (ok) pass++
  else fail++
  console.log(
    `  ${ok ? '✅' : '❌'} ${path.padEnd(34)} javno=${String(gotPublic).padEnd(5)} admin=${String(gotAdmin).padEnd(5)} ${why}`,
  )
  if (!ok) console.log(`     očekivano: javno=${wantPublic} admin=${wantAdmin}`)
}

console.log('\n=== Javne rute (bez Clerk sesije) ===')
check('/api/cron/notifications', true, false, 'scheduler — Bearer CRON_SECRET')
check('/api/cron/low-stock', true, false, 'Vercel Cron — Bearer CRON_SECRET')
check('/api/cron/refresh-access', true, false, 'Vercel Cron — Bearer CRON_SECRET')
check('/api/push/rotate', true, false, 'service worker — bez Clerk sesije, auth = posedovanje endpoint-a')
check('/api/email/unsubscribe', true, false, 'List-Unsubscribe one-click — auth je HMAC token')
check('/odjava-mejlova', true, false, 'potvrda odjave — uređaj bez logina')
check('/api/webhooks/clerk', true, false, 'svix potpis')
check('/api/webhooks/woocommerce', true, false, 'Woo potpis')
check('/manifest.webmanifest', true, false, 'browser dohvata anonimno')
check('/~offline', true, false, 'offline fallback bez logina')
check('/', true, false, 'landing')
check('/sign-in', true, false, 'auth')
check('/sign-up/nastavak', true, false, 'auth catch-all')
check('/style-guide', true, false, 'design sistem')

console.log('\n=== Zaštićene rute (traže Clerk sesiju) ===')
check('/dashboard', false, false, 'korisnik')
check('/protokol', false, false, 'korisnik')
check('/zalihe', false, false, 'korisnik')
check('/podesavanja', false, false, 'korisnik')
check('/onboarding', false, false, 'korisnik')
// Paywall ekran mora ostati iza Clerk sesije: bez profila nema šta da se prikaže,
// a `getCurrentProfile()` bi vratio null i redirect na /sign-in.
check('/nemas-pristup', false, false, 'gejt pristupa — traži profil')
check('/api/email/test', false, false, 'admin gate u handleru')

console.log('\n=== Admin rute (traže rolu) ===')
check('/admin', false, true, 'admin stranica')
check('/admin/korisnici', false, true, 'admin stranica')
check('/admin/porudzbine', false, true, 'admin stranica')
check('/api/admin/push/test', false, true, 'admin API')
check('/api/admin/push/diagnose', false, true, 'admin API')
check('/api/admin/woocommerce/backfill', false, true, 'admin API')

console.log('\n=== Dijagnostika i heartbeat ===')
// Ruta koja javlja da je dispatcher mrtav mora i sama biti dostupna adminu —
// da alert ne zavisi od iste karike koja je otkazala.
check('/api/admin/push/diagnose', false, true, 'zdravlje dispatchera (cron_runs)')
check('/api/admin/push/reset-dedup', false, true, 'reset dedup-a za test')

console.log('\n=== Odjava sa mejlova (List-Unsubscribe) ===')
// Gmail/Yahoo šalju one-click POST bez ijedne sesije. Iza `auth.protect()` bi
// za ne-HTML zahtev dobili 404 → provajder to broji kao pokvarenu odjavu.
check('/api/email/unsubscribe', true, false, 'javna: auth je potpisan token')
// Susedna ruta pod istim prefiksom NE sme da postane javna zbog prefiksa.
check('/api/email/test', false, false, 'admin gejt u handleru, ostaje iza sesije')

console.log('\n=== Rotacija push pretplate ===')
// SW zove ovu rutu iz `pushsubscriptionchange`, često bez ijednog otvorenog prozora.
// Clerk `__session` je kratkoživeći JWT koji osvežava klijent — bez klijenta bi
// `auth.protect()` vratio 404 i rotacija bi otkazivala baš kad je najpotrebnija.
check('/api/push/rotate', true, false, 'javna: auth je posedovanje starog endpoint-a')
// Prefiks NE sme da bude javan — buduća push ruta mora da se klasifikuje svesno.
check('/api/push/test-nesto', false, false, 'susedna push ruta ostaje iza sesije')

console.log('\n=== Cron rute NE smeju biti admin-gejtovane ===')
for (const p of ['/api/cron/notifications', '/api/cron/low-stock', '/api/cron/refresh-access']) {
  const gated = isAdminRoute(req(p))
  if (gated) {
    fail++
    console.log(`  ❌ ${p} je admin-gejtovana — scheduler bi bio redirektovan`)
  } else {
    pass++
    console.log(`  ✅ ${p}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Iscrpna provera: SVAKA `/api` ruta na disku mora biti svesno klasifikovana.
//
// Provere iznad hvataju samo rute kojih se neko setio da ih doda. Bug zbog kog
// ovaj harness postoji je bug PROPUSTA — ruta se doda, niko je ne stavi u
// `PUBLIC_ROUTES`, Clerk je presretne i vrati 404, a otkaz izgleda kao „ruta ne
// postoji". Zato se spisak čita sa FAJL SISTEMA: nova `/api` ruta obara QA dok
// se ne odluči kako se gejtuje.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Rute koje SVESNO traže Clerk sesiju (nisu ni javne ni admin-matchovane).
 * Dodavanje ovde je eksplicitna odluka, ne previd.
 */
const SESSION_ROUTES = new Set([
  // Admin gejt je u samom handleru (`requireAdmin`), ne u middleware-u.
  '/api/email/test',
])

/** Sve `route.ts` fajlove ispod `app/api` prevedi u URL putanje. */
function discoverApiRoutes(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
        const rel = relative(root, dir)
        // Next route groups `(ime)` ne učestvuju u URL-u.
        const segments = rel.split(sep).filter((sgmt) => sgmt && !sgmt.startsWith('('))
        out.push(`/api${segments.length > 0 ? `/${segments.join('/')}` : ''}`)
      }
    }
  }
  walk(root)
  return out.sort()
}

console.log('\n=== Svaka /api ruta na disku je klasifikovana ===')
const apiRoot = new URL('../app/api', import.meta.url).pathname
for (const path of discoverApiRoutes(apiRoot)) {
  const isPublic = isPublicRoute(req(path))
  const isAdmin = isAdminRoute(req(path))
  const declared = SESSION_ROUTES.has(path)
  const classified = isPublic || isAdmin || declared

  if (classified) {
    pass++
    const kind = isPublic ? 'javna' : isAdmin ? 'admin' : 'sesija'
    console.log(`  ✅ ${path.padEnd(38)} ${kind}`)
  } else {
    fail++
    console.log(`  ❌ ${path.padEnd(38)} NIJE klasifikovana`)
    console.log(
      '     Ruta bez Clerk sesije mora u PUBLIC_ROUTES (lib/route-config.ts) — inače je',
    )
    console.log(
      '     auth.protect() presretne i Clerk za ne-HTML zahteve vrati 404, pa ruta tiho umre.',
    )
    console.log('     Ako NAMERNO traži sesiju, dodaj je u SESSION_ROUTES u ovom fajlu.')
  }
}

console.log(`\n──────────────\nRezultat: ${pass} prošlo, ${fail} palo\n`)
process.exit(fail > 0 ? 1 : 0)
