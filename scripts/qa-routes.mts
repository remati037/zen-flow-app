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
check('/api/email/test', false, false, 'admin gate u handleru')

console.log('\n=== Admin rute (traže rolu) ===')
check('/admin', false, true, 'admin stranica')
check('/admin/korisnici', false, true, 'admin stranica')
check('/admin/porudzbine', false, true, 'admin stranica')
check('/api/admin/push/test', false, true, 'admin API')
check('/api/admin/push/diagnose', false, true, 'admin API')
check('/api/admin/woocommerce/backfill', false, true, 'admin API')

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

console.log(`\n──────────────\nRezultat: ${pass} prošlo, ${fail} palo\n`)
process.exit(fail > 0 ? 1 : 0)
