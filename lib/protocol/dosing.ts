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
