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
    description: 'Mesec dana doslednosti — pun efekat protokola.',
    icon: Crown,
  },
  {
    key: 'prvi-fokus',
    title: 'Prvi fokus blok',
    description: 'Završi svoj prvi Pomodoro blok do kraja.',
    icon: Timer,
  },
  {
    key: 'fokus-10',
    title: '10 fokus blokova',
    description: 'Završi ukupno deset Pomodoro blokova.',
    icon: Brain,
  },
  {
    key: 'puna-nedelja',
    title: 'Puna nedelja',
    description: 'Sakupi sedam kompletnih dana (obe doze) — ne moraju zaredom.',
    icon: CalendarCheck,
  },
]

export const BADGE_COUNT = BADGE_CATALOG.length

const BY_KEY = new Map<string, BadgeDefinition>(BADGE_CATALOG.map((b) => [b.key, b]))
const ORDER = new Map<string, number>(BADGE_CATALOG.map((b, i) => [b.key, i]))

export function isBadgeKey(key: string): key is BadgeKey {
  return BY_KEY.has(key)
}

/** Definicija po ključu; `undefined` za nepoznat ključ (npr. stari red u bazi). */
export function getBadge(key: string): BadgeDefinition | undefined {
  return BY_KEY.get(key)
}

/**
 * Sortira ključeve po redosledu iz kataloga i odbacuje nepoznate.
 * Koristi se i za award rezultat i za prikaz — redosled je uvek isti.
 */
export function sortBadgeKeys(keys: readonly string[]): BadgeKey[] {
  return keys
    .filter(isBadgeKey)
    .sort((a, b) => ORDER.get(a)! - ORDER.get(b)!)
}
