/**
 * Katalog bedževa — JEDINI izvor istine za ključeve, redosled i tekstove.
 *
 * Award engine (`lib/badges/award.ts`), stranica `/bedzevi` i celebration toast
 * čitaju isključivo odavde; DB čuva samo `badge_key`, bez ikakvih tekstova.
 *
 * Client-safe: NEMA `server-only` — koristi ga i toast na klijentu.
 */

import {
  Brain,
  CalendarCheck,
  Crown,
  Flame,
  Medal,
  Pill,
  Sprout,
  Timer,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { type BadgeKey } from './keys'

// Ključevi i redosled žive u `keys.ts` (bez ikona) — re-eksport za postojeće pozivaoce.
export { BADGE_KEYS, isBadgeKey, sortBadgeKeys, type BadgeKey } from './keys'

export interface BadgeDefinition {
  key: BadgeKey
  title: string
  /** Kako se osvaja — isti tekst ide i na zaključanu karticu i u toast. */
  description: string
  icon: LucideIcon
}

/** Redosled u nizu = redosled prikaza na stranici i u toast-ovima. */
export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  {
    key: 'protokol-zapocet',
    title: 'Protokol započet',
    description: 'Završi onboarding i postavi svoj ZenFlow protokol.',
    icon: Sprout,
  },
  {
    key: 'prva-doza',
    title: 'Prva doza',
    description: 'Označi svoju prvu dozu u protokolu.',
    icon: Pill,
  },
  {
    key: 'niz-3',
    title: 'Niz od 3 dana',
    description: 'Uzmi obe doze tri dana zaredom.',
    icon: Flame,
  },
  {
    key: 'niz-7',
    title: 'Niz od 7 dana',
    description: 'Uzmi obe doze sedam dana zaredom.',
    icon: Zap,
  },
  {
    key: 'niz-14',
    title: 'Niz od 14 dana',
    description: 'Dve pune nedelje bez propuštene doze.',
    icon: Medal,
  },
  {
    key: 'niz-30',
    title: 'Niz od 30 dana',
    description: 'Mesec dana bez prekida. Tada protokol daje pun efekat.',
    icon: Crown,
  },
  {
    key: 'prvi-fokus',
    title: 'Prvi fokus blok',
    description: 'Završi svoj prvi fokus blok do kraja.',
    icon: Timer,
  },
  {
    key: 'fokus-10',
    title: '10 fokus blokova',
    description: 'Završi ukupno deset fokus blokova.',
    icon: Brain,
  },
  {
    key: 'puna-nedelja',
    title: 'Puna nedelja',
    description: 'Sakupi sedam dana sa obe doze. Ne moraju biti zaredom.',
    icon: CalendarCheck,
  },
]

export const BADGE_COUNT = BADGE_CATALOG.length

const BY_KEY = new Map<string, BadgeDefinition>(BADGE_CATALOG.map((b) => [b.key, b]))


/** Definicija po ključu; `undefined` za nepoznat ključ (npr. stari red u bazi). */
export function getBadge(key: string): BadgeDefinition | undefined {
  return BY_KEY.get(key)
}

