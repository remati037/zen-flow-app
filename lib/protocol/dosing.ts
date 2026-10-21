/**
 * Doziranje ZenFlow protokola — jedinstveni izvor istine za izračun zaliha.
 *
 * Protokol: 2 kapsule po dozi × 2 doze dnevno (jutro + veče) = 4 kapsule/dan.
 * Otuda: 60 kapsula (1 pakovanje) = 15 dana; 120 kapsula (2 pakovanja) = 30 dana.
 */

import { addDaysIso, daysBetweenIso } from '@/lib/dates'

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
 * Početne zalihe na kraju onboardinga.
 *
 * Korisnik bira broj kupljenih pakovanja i datum početka protokola, koji sme biti
 * do 60 dana unazad. Ranije su zalihe bile `pakovanja × 60` bez obzira na datum,
 * pa je neko ko je počeo pre 20 dana dobijao 80 kapsula „viška" i low-stock alert
 * je stizao ~20 dana kasno — posle nego što bi ostao bez proizvoda.
 *
 * Oduzimaju se dani OD početka DO juče (danas se tek check-in-uje i to troši
 * kapsule kroz `logDose`). Clamp na 0. Korisnik koji kasnije naknadno označi neki
 * od tih dana kroz backfill skida još 2 kapsule po dozi — svesna razmena: greška
 * je u smeru ranijeg alerta, a „Koriguj" na /zalihe je uvek dostupan.
 */
export function initialCapsulesForStart(
  packages: number,
  startDateIso: string,
  todayIso: string,
): number {
  const elapsedDays = Math.max(0, daysBetweenIso(startDateIso, todayIso))
  return Math.max(0, packages * CAPSULES_PER_PACKAGE - elapsedDays * CAPSULES_PER_DAY)
}

/**
 * Prag ispod kog su zalihe "pri kraju": 14 kapsula ≈ 3.5 dana na 4 kapsule/dan.
 * Jedini izvor istine — koriste ga i UI kartice i low-stock cron.
 */
export const LOW_STOCK_THRESHOLD = 14

/**
 * Koliko dana pre procenjenog isteka zaliha se alert pali i kad broj kapsula u
 * bazi to ne pokazuje. Isti horizont kao `LOW_STOCK_THRESHOLD` (14 kapsula ≈ 4 dana).
 */
export const LOW_STOCK_LEAD_DAYS = Math.ceil(LOW_STOCK_THRESHOLD / CAPSULES_PER_DAY)

/**
 * Da li su zalihe „pri kraju" — po broju kapsula ILI po procenjenom datumu isteka.
 *
 * Samo broj kapsula nije dovoljan: korisnik koji pije kapsule, ali prestane da
 * štiklira, nikad ne spusti `capsules_remaining` ispod praga — ne dobije alert i
 * tiho ostane bez proizvoda. To su baš korisnici kojima je podsetnik najpotrebniji.
 * `estimated_runout_date` se računa pri svakom upisu u `supply` i ne pomera se dok
 * korisnik ne štiklira, pa ga datum uhvati.
 */
export function isLowStock(
  capsulesRemaining: number,
  estimatedRunoutDate: string | null,
  todayIso: string,
): boolean {
  if (capsulesRemaining <= LOW_STOCK_THRESHOLD) return true
  return estimatedRunoutDate !== null && estimatedRunoutDate <= addDaysIso(todayIso, LOW_STOCK_LEAD_DAYS)
}

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
