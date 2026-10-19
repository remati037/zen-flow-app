/**
 * Sledeći prag niza („još 2 dana do bedža Niz od 7 dana").
 *
 * Čist modul (bez `server-only`): koristi ga dashboard karta na klijentu i QA.
 * Pragovi i nazivi dolaze iz kataloga bedževa — jedini izvor istine za tekstove.
 */

import { BADGE_CATALOG, type BadgeKey } from '@/lib/badges/catalog'

/** Bedževi niza, rastuće po pragu. Ključ `niz-N` nosi prag u imenu. */
const STREAK_MILESTONES: readonly { days: number; key: BadgeKey }[] = BADGE_CATALOG.filter((b) =>
  b.key.startsWith('niz-'),
)
  .map((b) => ({ days: Number(b.key.slice('niz-'.length)), key: b.key }))
  .filter((m) => Number.isInteger(m.days) && m.days > 0)
  .sort((a, b) => a.days - b.days)

export interface StreakMilestone {
  /** Prag niza koji otključava bedž. */
  days: number
  /** Koliko KOMPLETNIH dana još fali (≥ 1). */
  remaining: number
  title: string
}

/**
 * Prvi prag iznad trenutnog niza, ili `null` kad su svi pređeni.
 * `current` je broj kompletnih dana zaredom (uključujući danas, ako je kompletan).
 */
export function nextStreakMilestone(current: number): StreakMilestone | null {
  const next = STREAK_MILESTONES.find((m) => m.days > current)
  if (!next) return null
  const title = BADGE_CATALOG.find((b) => b.key === next.key)?.title ?? `Niz od ${next.days} dana`
  return { days: next.days, remaining: next.days - Math.max(0, current), title }
}

/** Srpska množina za „dan": 1 dan, 2–4 dana, 5+ dana (21 dan, 22 dana…). */
export function danaLabel(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'dan'
  return 'dana'
}
