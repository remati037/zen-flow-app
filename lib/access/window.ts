/**
 * Prozor pristupa — JEDINI izvor istine za "koliko dugo jedna porudžbina drži pristup".
 *
 * Zašto poseban modul: isti prozor treba i VIP gejtu (`lib/access/status.ts`, koji je
 * `server-only`) i streak logici (`lib/protocol/streak.ts`, koja mora ostati client-safe).
 * Dok je konstanta bila duplirana, dve strane su je i računale različito:
 *   - coverage: `addDaysIso(dan, 60)` — kalendarski, inkluzivno
 *   - VIP: `now - orderDate <= 60 * 24h` — ms aritmetika, sa DST driftom i satnicom
 * Posledica: poslednji pokriveni dan je za streak bio "pokriven", a za gejt već `inactive`
 * → korisnik ne može da se čekira, pa mu nekompletan pokriven dan RESETUJE niz umesto
 * da ga zamrzne. Zato su oba prozora ovde, na beogradskom KALENDARSKOM danu.
 *
 * Client-safe: NEMA `server-only`.
 */

import { addDaysIso } from '@/lib/dates'

/**
 * Porudžbina drži pristup na dan porudžbine + 60 kalendarskih dana (inkluzivno),
 * tj. 61 beogradski dan ukupno. CLAUDE.md: "porudžbina u poslednjih 60 dana".
 */
export const ACCESS_WINDOW_DAYS = 60

/** Poslednji beogradski dan (inkluzivno) koji data porudžbina još pokriva. */
export function accessWindowEnd(orderDayIso: string): string {
  return addDaysIso(orderDayIso, ACCESS_WINDOW_DAYS)
}

/**
 * Najstariji dan porudžbine koji danas još daje pristup — granica za SQL upite
 * (`order_date::date >= cutoff`). Ekvivalentno sa `isWithinAccessWindow`.
 */
export function accessWindowCutoff(todayIso: string): string {
  return addDaysIso(todayIso, -ACCESS_WINDOW_DAYS)
}

/** Da li porudžbina od `orderDayIso` još pokriva `todayIso` (oba beogradski dani). */
export function isWithinAccessWindow(orderDayIso: string, todayIso: string): boolean {
  return todayIso <= accessWindowEnd(orderDayIso)
}
