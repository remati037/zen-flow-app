/**
 * Pravila vremenskih prozora za notification dispatcher.
 *
 * Čista logika, bez DB i bez `server-only` — dele je cron ruta (koja stvarno
 * šalje) i admin dijagnostika (koja objašnjava zašto nešto nije poslato). Bez
 * ovog modula bi se ista aritmetika duplirala i razišla.
 */

/**
 * Podrazumevana širina prozora.
 *
 * Nije jednaka razmaku schedulera (15 min) nego mu je TROSTRUKA, i to namerno.
 * Dispatcher vozi GitHub Actions, a njegov `schedule` nije precizan: kašnjenja
 * od 10–20 min su normalna, a pod opterećenjem run ume i da se **preskoči**.
 * Sa prozorom od 30 min jedan preskočen run + 15 min kašnjenja pojede ceo
 * prozor i podsetnik se gubi zauvek (prozor se ne ponavlja sutra).
 *
 * Pravilo je egzaktno: pokrivenost je potpuna dok je STVARAN razmak između dva
 * poziva ≤ prozor. Pri kadenci od 15 min razmak je `15 × (1 + broj preskočenih)
 * + razlika u kašnjenju`, pa prozor od 45 pokriva „jedan preskočen run + do 15
 * min dodatnog kašnjenja" ili „bez preskakanja + do 30 min kašnjenja". Prozor od
 * 30 pokriva samo tačno jedan preskočen run bez ikakvog kašnjenja — a upravo se
 * kašnjenje i dešava.
 *
 * Zašto je širi prozor BEZBEDAN: dedup radi po beogradskom danu i tipu
 * (`filterNotifiedSince` sa `since = belgradeDayStart()`, `channel: 'push'`,
 * `status = 'success'` — vidi `lib/push/dedup.ts`), a NE po prozoru. Koliko god
 * run-ova palo unutar istog prozora, drugi i svaki sledeći vide uspešan red u
 * `notifications_log` i preskoče korisnika. Širina prozora zato menja SAMO
 * koliko kasno podsetnik još sme da izađe, nikad koliko ih izađe.
 *
 * Cena: podsetnik može stići do 45 min posle podešenog vremena, a doze
 * podešene posle 23:15 dobijaju ga ranije (vidi `LATEST_WINDOW_START_MIN`).
 */
const DEFAULT_WINDOW_MIN = 45

/**
 * Koliko minuta posle ciljanog vremena reminder još sme da se pošalje.
 *
 * Podesivo preko `NOTIFICATION_WINDOW_MIN` jer je vezano za kadencu schedulera,
 * a ona je infrastruktura, ne kod. Pravilo uparivanja:
 *
 *   prozor ≥ razmak poziva + tolerancija kašnjenja
 *
 * Preciznost isporuke ≈ razmak poziva, NE širina prozora. Za podsetnik "u minut"
 * treba scheduler na 1 min i prozor 2 (cron-job.org to podržava; GitHub Actions
 * ne — minimum mu je 5 min i raspored mu kasni, pa mu prozor mora biti širok).
 *
 * `lib/cron/health.ts` istim brojem meri rupe u rasporedu: razmak između dva
 * run-a veći od prozora znači da su podsetnici u toj rupi izgubljeni.
 */
export const WINDOW_MIN = readWindowMin()

function readWindowMin(): number {
  const raw = Number(process.env.NOTIFICATION_WINDOW_MIN)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_WINDOW_MIN
  // Clamp: ispod 1 min prozor je neupotrebljiv, iznad 60 podsetnik gubi smisao.
  return Math.min(60, Math.max(1, Math.round(raw)))
}

/** Minuta u danu. */
export const MINUTES_PER_DAY = 24 * 60

/** Streak-at-risk ne šalji pre ovog sata (beogradsko veče). */
export const STREAK_RISK_EARLIEST_MIN = 21 * 60

/** Streak-at-risk: koliko posle večernje doze počinje prozor. */
export const STREAK_RISK_AFTER_EVENING_MIN = 90

/**
 * Najkasniji početak bilo kog prozora — ceo prozor mora da stane pre ponoći.
 *
 * Zašto: `nowMin` se u ponoć resetuje na 0, pa prozor koji prelazi 1440 nijedan
 * scheduler tick ne može da pogodi. Bez ovog clamp-a kasno podešena doza NIKAD
 * ne bi dobila podsetnik (npr. prozor [1430, 1475) je nedostižan).
 * Posledica clamp-a: za vrlo kasne doze podsetnik stigne ranije — najviše
 * `WINDOW_MIN - 1` min (35 pri prozoru 45, jer je najkasniji start 23:15) —
 * što je neuporedivo bolje nego da ne stigne uopšte. Širi prozor tu preciznost
 * plaća; to je svesna razmena za to da nijedan podsetnik ne propadne.
 */
export const LATEST_WINDOW_START_MIN = latestStart(WINDOW_MIN)

/**
 * Najkasniji start za PROIZVOLJNU širinu prozora.
 *
 * Parametar postoji da `scripts/qa-dates.mts` može da uporedi 30 i 45 nad ISTIM
 * produkcionim funkcijama; produkcija ga nikad ne prosleđuje.
 */
function latestStart(windowMin: number): number {
  return MINUTES_PER_DAY - windowMin
}

/** Da li je `nowMin` u [start, start + windowMin). */
export function inWindow(nowMin: number, start: number, windowMin: number = WINDOW_MIN): boolean {
  return nowMin >= start && nowMin < start + windowMin
}

/** Početak prozora za podsetnik na dozu — clamp-ovan da stane u dan. */
export function reminderWindowStart(doseMinutes: number, windowMin: number = WINDOW_MIN): number {
  return Math.min(latestStart(windowMin), Math.max(0, doseMinutes))
}

/** Početak streak-at-risk prozora: `max(21:00, veče + 90min)`, clamp-ovan u dan. */
export function streakRiskWindowStart(
  eveningMinutes: number | null,
  windowMin: number = WINDOW_MIN,
): number {
  return Math.min(
    latestStart(windowMin),
    Math.max(
      STREAK_RISK_EARLIEST_MIN,
      eveningMinutes === null ? 0 : eveningMinutes + STREAK_RISK_AFTER_EVENING_MIN,
    ),
  )
}

/** 'HH:mm' iz minuta od ponoći — za prikaz prozora u dijagnostici. */
export function minutesToHm(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
