/**
 * Klasifikacija ruta za `middleware.ts`.
 *
 * Izdvojeno iz middleware-a da bi isti spiskovi mogli da se proveravaju u
 * `scripts/qa-routes.mts` bez učitavanja Clerk-a. Fajl namerno nema import-e —
 * čiste konstante, pa test ne može da se raziđe sa produkcionim ponašanjem.
 */

/**
 * Rute dostupne bez Clerk sesije.
 *
 * `/api/cron(.*)` je ovde jer se cron rute autentikuju `Authorization: Bearer
 * CRON_SECRET` headerom u samom handleru, a ne Clerk sesijom. Bez ovog izuzetka
 * `auth.protect()` ih presretne i Clerk za ne-HTML zahteve vrati **404** (ne 401),
 * pa scheduler i Vercel Cron tiho dobijaju "ruta ne postoji" — najgori mogući
 * simptom, jer izgleda kao da endpoint ne postoji umesto kao problem sa auth-om.
 */
export const PUBLIC_ROUTES = [
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/style-guide',
  // Webhook MORA biti javan — Woo/Clerk nemaju sesiju, potpis se verifikuje u handleru.
  '/api/webhooks(.*)',
  '/api/cron(.*)',
  // PWA: manifest dohvata browser anonimno, offline fallback mora raditi bez logina.
  '/manifest.webmanifest',
  '/~offline',
] as const

/** Rute zaštićene admin rolom (stranice + admin API). */
export const ADMIN_ROUTES = ['/admin(.*)', '/api/admin(.*)'] as const
