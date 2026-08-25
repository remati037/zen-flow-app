/**
 * Doziranje ZenFlow protokola — jedinstveni izvor istine za izračun zaliha.
 *
 * Protokol: 2 kapsule po dozi × 2 doze dnevno (jutro + veče) = 4 kapsule/dan.
 * Otuda: 60 kapsula (1 pakovanje) = 15 dana; 120 kapsula (2 pakovanja) = 30 dana.
 */

import { addDaysIso } from '@/lib/dates'

export const CAPSULES_PER_DOSE = 2
export const DOSES_PER_DAY = 2
export const CAPSULES_PER_DAY = CAPSULES_PER_DOSE * DOSES_PER_DAY // 4
export const CAPSULES_PER_PACKAGE = 60

/** Procena broja dana koliko traje dato stanje kapsula pri tekućem ritmu. */
export function estimateDaysRemaining(capsulesRemaining: number): number {
  return Math.ceil(Math.max(0, capsulesRemaining) / CAPSULES_PER_DAY)
}

/**
 * Procena datuma isteka zaliha: početni datum + broj dana koliko traju kapsule.
 * Prima i vraća 'YYYY-MM-DD' (kompatibilno sa Postgres `date` kolonom), preko
 * `addDaysIso` — bez lokalnog `Date` drifta / timezone off-by-one.
 */
export function estimateRunoutDate(startDateIso: string, capsulesRemaining: number): string {
  return addDaysIso(startDateIso, estimateDaysRemaining(capsulesRemaining))
}

/**
 * Prag ispod kog su zalihe "pri kraju": 14 kapsula ≈ 3.5 dana na 4 kapsule/dan.
 * Jedini izvor istine — koriste ga i UI kartice i low-stock cron.
 */
export const LOW_STOCK_THRESHOLD = 14

/**
 * Koliko low-stock alerta sme da izađe u JEDNOJ epizodi niskih zaliha (V10).
 *
 * Epizoda traje dok zalihe ne pređu prag; brojač je `supply.low_stock_alerts_sent`
 * i resetuje ga svaki upis koji digne zalihe iznad praga (top-up iz Woo-a, ručna
 * korekcija, undo check-ina).
 *
 * Zašto 3, i zašto uopšte: dedup od 3 dana ograničava UČESTALOST, ne UKUPAN broj.
 * Korisnik koji ostane bez zaliha i ne dokupi mesec dana dobijao je ~10 identičnih
 * mejlova — a poruka koja se ponavlja u nedogled se ne čita nego prijavljuje kao
 * spam, što ruši isporučivost SVIH mejlova sa domena, uključujući welcome.
 * Tri pokušaja u ~9 dana su dovoljna da poruka stigne; posle toga ćutanje je
 * korisnije od još jednog istog mejla. Push ima isti cap iz istog razloga.
 */
export const LOW_STOCK_MAX_ALERTS_PER_EPISODE = 3
