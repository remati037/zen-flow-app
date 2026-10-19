import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Potpisani token za check-in iz notifikacije (dugme „Uzeto").
 *
 * Service worker poziva `/api/push/checkin` iz `notificationclick`, često bez
 * ijednog otvorenog prozora — Clerk sesije tu nema (isti razlog kao rotacija
 * pretplate). Token vezuje TAČNO jednu radnju (korisnik + dan + doza) za tajnu
 * koju zna samo server: ne može se izmisliti, ne može se preneti na drugi dan ni
 * na drugu dozu, i ne otkriva ključ.
 *
 * Čist modul (bez `server-only`), da ga QA harness pokrije — pokvaren token
 * znači ili dugme koje ne radi, ili check-in koji može da izvede bilo ko.
 *
 * Rok važenja nosi sam dan u poruci: ruta prihvata samo danas i juče (vidi rutu),
 * pa stara notifikacija posle toga ne upisuje ništa.
 */

export type CheckinDose = 'morning' | 'evening'

/** Zaseban ključ ako postoji, inače `CRON_SECRET` (server-only, nikad ne ide klijentu). */
function signingKey(): string | null {
  return process.env.PUSH_ACTION_SECRET || process.env.CRON_SECRET || null
}

export function checkinToken(userId: string, date: string, dose: CheckinDose): string | null {
  const key = signingKey()
  if (!key) return null
  return createHmac('sha256', key).update(`checkin:${userId}:${date}:${dose}`).digest('hex')
}

/** Provera u konstantnom vremenu; dužina se proverava unapred (`timingSafeEqual` baca). */
export function verifyCheckinToken(userId: string, date: string, dose: CheckinDose, token: string): boolean {
  const expected = checkinToken(userId, date, dose)
  if (!expected || token.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'))
}
