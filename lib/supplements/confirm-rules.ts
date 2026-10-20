import { daysBetweenIso } from '@/lib/dates'

/** Posle ovoliko beogradskih dana bez potvrde kartica pita „da li je stack isti". */
export const CONFIRM_AFTER_DAYS = 7

/** Admin agregat broji kao „aktivan" samo unos potvrđen u poslednjih ovoliko dana. */
export const FRESH_WITHIN_DAYS = 30

/**
 * `oldestConfirmedOn` = najstariji `last_confirmed_on` među AKTIVNIM redovima korisnika
 * (`null` kad nema nijednog). Razlika ide kroz kalendarske dane (`daysBetweenIso`) —
 * ms-aritmetika drifta na DST-u.
 */
export function needsConfirmation(oldestConfirmedOn: string | null, today: string): boolean {
  if (oldestConfirmedOn === null) return false
  return daysBetweenIso(oldestConfirmedOn, today) >= CONFIRM_AFTER_DAYS
}
