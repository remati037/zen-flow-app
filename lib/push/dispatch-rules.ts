/**
 * Pravila vremenskih prozora za notification dispatcher.
 *
 * Čista logika, bez DB i bez `server-only` — dele je cron ruta (koja stvarno
 * šalje) i admin dijagnostika (koja objašnjava zašto nešto nije poslato). Bez
 * ovog modula bi se ista aritmetika duplirala i razišla.
 */

/** Koliko minuta posle ciljanog vremena reminder još sme da se pošalje. */
export const WINDOW_MIN = 30

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
 * scheduler tick ne može da pogodi. Bez ovog clamp-a doza podešena između 23:46
 * i 23:59 NIKAD ne bi dobila podsetnik (prozor [1426, 1456) je nedostižan).
 * Posledica clamp-a: za vrlo kasne doze podsetnik stigne do 29 min ranije —
 * što je neuporedivo bolje nego da ne stigne uopšte.
 */
export const LATEST_WINDOW_START_MIN = MINUTES_PER_DAY - WINDOW_MIN

/** Da li je `nowMin` u [start, start + WINDOW_MIN). */
export function inWindow(nowMin: number, start: number): boolean {
  return nowMin >= start && nowMin < start + WINDOW_MIN
}

/** Početak prozora za podsetnik na dozu — clamp-ovan da stane u dan. */
export function reminderWindowStart(doseMinutes: number): number {
  return Math.min(LATEST_WINDOW_START_MIN, Math.max(0, doseMinutes))
}

/** Početak streak-at-risk prozora: `max(21:00, veče + 90min)`, clamp-ovan u dan. */
export function streakRiskWindowStart(eveningMinutes: number | null): number {
  return Math.min(
    LATEST_WINDOW_START_MIN,
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
