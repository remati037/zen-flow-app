/**
 * Ključevi bedževa i njihov redosled — BEZ ikona i tekstova.
 *
 * Izdvojeno iz `catalog.ts` jer katalog uvozi `lucide-react` (ikone), a award
 * engine (`award.ts`) treba samo ključeve. Preko kataloga je svaki server modul
 * koji dodeljuje bedževe vukao React komponente — van Next runtime-a (QA harness)
 * to puca, pa `logDose`/`recordDose` nikad nisu mogli da se izvrše u `qa-sql`.
 *
 * Redosled u nizu = redosled prikaza i u toast-ovima. `catalog.ts` mora da prati
 * isti redosled (proverava `qa-dates`).
 */

export const BADGE_KEYS = [
  'protokol-zapocet',
  'prva-doza',
  'niz-3',
  'niz-7',
  'niz-14',
  'niz-30',
  'prvi-fokus',
  'fokus-10',
  'puna-nedelja',
] as const

export type BadgeKey = (typeof BADGE_KEYS)[number]

const ORDER = new Map<string, number>(BADGE_KEYS.map((key, i) => [key, i]))

export function isBadgeKey(key: string): key is BadgeKey {
  return ORDER.has(key)
}

/**
 * Sortira ključeve po redosledu iz kataloga i odbacuje nepoznate.
 * Koristi se i za award rezultat i za prikaz — redosled je uvek isti.
 */
export function sortBadgeKeys(keys: readonly string[]): BadgeKey[] {
  return keys.filter(isBadgeKey).sort((a, b) => ORDER.get(a)! - ORDER.get(b)!)
}
