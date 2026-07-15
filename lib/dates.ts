/**
 * Jedini izvor "danas" u aplikaciji — sve vezano za datum ide preko ovog modula.
 *
 * Zašto: sečenje UTC ISO stringa vraća UTC datum, pa oko ponoći po Beogradu
 * (UTC+1/UTC+2) daje off-by-one — streak i zalihe bi računali pogrešan dan.
 * Ovde je "danas" uvek beogradski kalendarski dan.
 *
 * Client-safe: NEMA `server-only` — koristi ga i onboarding wizard na klijentu.
 */

const BELGRADE_TZ = 'Europe/Belgrade'

/** Beogradski kalendarski dan kao 'YYYY-MM-DD' (sv-SE lokal daje ISO format nativno). */
export function belgradeToday(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: BELGRADE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Beogradsko vreme kao 'HH:mm' (24h). */
export function belgradeTimeHM(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: BELGRADE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

/**
 * Dodaje `days` na ISO datum ('YYYY-MM-DD') čistom UTC aritmetikom.
 * Bez lokalnog `Date` drifta / DST iznenađenja — parsira komponente, računa preko
 * `Date.UTC`, pa reformatira. `days` može biti negativan.
 */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const ts = Date.UTC(y, m - 1, d + days)
  const out = new Date(ts)
  const yy = out.getUTCFullYear()
  const mm = String(out.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(out.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
