/**
 * Doziranje ZenFlow protokola — jedinstveni izvor istine za izračun zaliha.
 *
 * Protokol: 2 kapsule po dozi × 2 doze dnevno (jutro + veče) = 4 kapsule/dan.
 * Otuda: 60 kapsula (1 pakovanje) = 15 dana; 120 kapsula (2 pakovanja) = 30 dana.
 */

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
 * Vraća 'YYYY-MM-DD' (kompatibilno sa Postgres `date` kolonom).
 */
export function estimateRunoutDate(startDate: Date, capsulesRemaining: number): string {
  const days = estimateDaysRemaining(capsulesRemaining)
  const runout = new Date(startDate)
  runout.setDate(runout.getDate() + days)
  return runout.toISOString().slice(0, 10)
}
