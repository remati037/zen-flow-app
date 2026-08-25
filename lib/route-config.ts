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
  /**
   * Rotacija push endpoint-a — zove je SERVICE WORKER iz `pushsubscriptionchange`,
   * često bez ijednog otvorenog prozora. Clerk `__session` je kratkoživeći JWT koji
   * osvežava klijent; bez klijenta nema svežeg tokena, pa bi `auth.protect()` rutu
   * presreo i (za ne-HTML zahteve) vratio 404 — tačno onaj tihi otkaz zbog kog
   * `scripts/qa-routes.mts` i postoji. Umesto sesije, ruta se autentikuje
   * POSEDOVANJEM starog endpoint-a i iz njega izvodi korisnika (vidi handler).
   *
   * TAČNA putanja, ne `/api/push(.*)`: buduća push ruta ne sme da postane javna
   * zato što deli prefiks.
   */
  '/api/push/rotate',
  /**
   * Odjava sa alert mejlova (V10). Zovu je mejl klijent i mailbox provider —
   * nijedan nema Clerk sesiju, a Gmail-ov one-click POST bi iza `auth.protect()`
   * dobio 404. Autentikacija je HMAC token u query stringu, ne sesija.
   * Stranica sa potvrdom je javna iz istog razloga (uređaj bez logina).
   *
   * TAČNE putanje, ne `/api/email(.*)`: `/api/email/test` MORA da ostane iza
   * sesije (admin gejt je u handleru).
   */
  '/api/email/unsubscribe',
  '/odjava-mejlova',
  // PWA: manifest dohvata browser anonimno, offline fallback mora raditi bez logina.
  '/manifest.webmanifest',
  '/~offline',
] as const

/** Rute zaštićene admin rolom (stranice + admin API). */
export const ADMIN_ROUTES = ['/admin(.*)', '/api/admin(.*)'] as const
