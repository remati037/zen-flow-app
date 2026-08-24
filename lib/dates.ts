/**
 * Jedini izvor "danas" u aplikaciji — sve vezano za datum ide preko ovog modula.
 *
 * Zašto: sečenje UTC ISO stringa vraća UTC datum, pa oko ponoći po Beogradu
 * (UTC+1/UTC+2) daje off-by-one — streak i zalihe bi računali pogrešan dan.
 * Ovde je "danas" uvek beogradski kalendarski dan.
 *
 * Client-safe: NEMA `server-only` — koristi ga i onboarding wizard na klijentu.
 */

/** Zona za sve kalendarske izračune. Eksportovana da je i SQL (`at time zone`) koristi. */
export const BELGRADE_TZ = 'Europe/Belgrade'

/** Beogradski kalendarski dan kao 'YYYY-MM-DD' (sv-SE lokal daje ISO format nativno). */
export function belgradeToday(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: BELGRADE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Dati `Date` (npr. `orders.orderDate` iz baze) kao beogradski kalendarski dan 'YYYY-MM-DD'. */
export function toBelgradeIso(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: BELGRADE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
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
 * Parsira 'HH:mm' ili Postgres `time` ('HH:mm:ss') u minute od ponoći.
 * Za poređenje vremena doza (`profiles.doseMorningTime`) sa `belgradeTimeHM()`.
 */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Offset beogradske zone u ms za dati instant (+1h zimi, +2h leti).
 * Trik: isti instant se formatira kao beogradsko zidno vreme, pa se pročita
 * kao da je UTC — razlika je tačno offset zone u tom trenutku.
 */
function belgradeOffsetMs(at: Date): number {
  const wall = new Intl.DateTimeFormat('sv-SE', {
    timeZone: BELGRADE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(at)
  // 'YYYY-MM-DD HH:mm:ss' → parsiraj kao UTC
  return Date.parse(`${wall.replace(' ', 'T')}Z`) - at.getTime()
}

/**
 * UTC timestamp početka TEKUĆEG beogradskog kalendarskog dana (00:00 po Beogradu).
 * Koristi se kao granica za "danas" dedup nad `notifications_log`.
 *
 * Ne oduzima proteklo vreme od ponoći — na dan DST prelaza dan nema 24h, pa bi
 * to promašilo granicu za ceo sat (29.03. unazad u prethodni dan, 25.10. unapred
 * u tekući). Umesto toga uzima ponoć kao "naivni" UTC timestamp i koriguje je
 * offsetom zone; drugi prolaz hvata slučaj kad prvi offset padne sa pogrešne
 * strane prelaza.
 */
export function belgradeDayStart(): Date {
  const [y, m, d] = belgradeToday().split('-').map(Number)
  const naiveMidnight = Date.UTC(y, m - 1, d)
  let ts = naiveMidnight - belgradeOffsetMs(new Date(naiveMidnight))
  ts = naiveMidnight - belgradeOffsetMs(new Date(ts))
  return new Date(ts)
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

/**
 * Broj kalendarskih dana između dva ISO datuma ('YYYY-MM-DD'), čista UTC
 * aritmetika (bez DST drifta). Pozitivno kad je `to` posle `from`, 0 za isti dan.
 */
export function daysBetweenIso(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/**
 * 'YYYY-MM-DD' → srpska latinica, npr. '14. jul 2026.'.
 * Parsira kao UTC da kalendarski dan ostane isti bez obzira na lokalnu zonu.
 * `options` prosleđuje dodatna `Intl` podešavanja (npr. `{ weekday: 'long' }`).
 */
export function formatIsoDateSr(
  iso: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('sr-Latn-RS', options).format(new Date(Date.UTC(y, m - 1, d)))
}
