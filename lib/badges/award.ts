import 'server-only'

import { and, count, eq } from 'drizzle-orm'

import { badges, db, focusSessions, profiles, protocolLogs } from '@/lib/db'
import { getProtocolState } from '@/lib/protocol/queries'
import { type BadgeKey, sortBadgeKeys } from './catalog'

/**
 * Award engine — poziva se na kraju akcije koja je mogla nešto da otključa
 * (`logDose`, `saveFocusSession`, `completeOnboarding`).
 *
 * Dva pravila:
 *  1. Po pozivu se računaju SAMO metrike relevantne za trigger — nema punog
 *     skeniranja svih bedževa na svaki check-in.
 *  2. Idempotentno: insert ide sa `.onConflictDoNothing()` (unique
 *     `badges_user_key_uq`), pa `.returning()` vraća isključivo redove koji su
 *     stvarno nastali. Ponovni check-in na istom streak-u vrati prazan niz.
 *
 * Nikad ne baca — greška ovde ne sme da obori check-in koji je već upisan.
 */

export type BadgeTrigger = 'dose' | 'focus' | 'onboarding'

export interface AwardOptions {
  trigger: BadgeTrigger
  /**
   * Već izračunat trenutni niz. `logDose` ga ima iz `getProtocolState`, pa se
   * prosleđuje da se streak ne računa dva puta. Bez njega se učita ovde.
   */
  currentStreak?: number
}

/** Pragovi niza → ključ bedža. */
const STREAK_MILESTONES: readonly (readonly [number, BadgeKey])[] = [
  [3, 'niz-3'],
  [7, 'niz-7'],
  [14, 'niz-14'],
  [30, 'niz-30'],
]

/** Kompletnih dana (obe doze) za `puna-nedelja` — ne moraju biti uzastopni. */
const FULL_WEEK_COMPLETE_DAYS = 7

/** Završenih Pomodoro blokova za `fokus-10`. */
const FOCUS_SESSIONS_MILESTONE = 10

/** Doze su dve dnevno — dan je kompletan kad su obe označene kao uzete. */
const DOSES_PER_DAY = 2

/** Fallback kad pozivalac nema streak pri ruci (npr. cron ili ručni poziv). */
async function loadCurrentStreak(userId: string): Promise<number> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1)
  if (!profile) return 0
  const { streak } = await getProtocolState(profile)
  return streak.current
}

/**
 * Metrike protokola iz JEDNOG upita: broj uzetih doza po danu.
 * Odatle ispadaju `prva-doza` (bilo koja uzeta doza) i `puna-nedelja`
 * (7 dana sa obe doze); streak milestone-i idu iz `currentStreak`.
 */
async function doseCandidates(userId: string, currentStreak?: number): Promise<BadgeKey[]> {
  const rows = await db
    .select({ date: protocolLogs.date, taken: count() })
    .from(protocolLogs)
    .where(and(eq(protocolLogs.userId, userId), eq(protocolLogs.status, 'taken')))
    .groupBy(protocolLogs.date)

  const earned: BadgeKey[] = []

  if (rows.length > 0) earned.push('prva-doza')

  const completeDays = rows.filter((r) => r.taken >= DOSES_PER_DAY).length
  if (completeDays >= FULL_WEEK_COMPLETE_DAYS) earned.push('puna-nedelja')

  const streak = currentStreak ?? (await loadCurrentStreak(userId))
  for (const [days, key] of STREAK_MILESTONES) {
    if (streak >= days) earned.push(key)
  }

  return earned
}

/** Broje se samo dovršeni blokovi — prekinuta sesija ne otključava bedž. */
async function focusCandidates(userId: string): Promise<BadgeKey[]> {
  const [row] = await db
    .select({ value: count() })
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), eq(focusSessions.completed, true)))

  const completed = row?.value ?? 0
  const earned: BadgeKey[] = []

  if (completed >= 1) earned.push('prvi-fokus')
  if (completed >= FOCUS_SESSIONS_MILESTONE) earned.push('fokus-10')

  return earned
}

async function candidatesFor(userId: string, options: AwardOptions): Promise<BadgeKey[]> {
  switch (options.trigger) {
    case 'onboarding':
      return ['protokol-zapocet']
    case 'focus':
      return focusCandidates(userId)
    case 'dose':
      return doseCandidates(userId, options.currentStreak)
  }
}

/**
 * Proveri i dodeli bedževe za dati trigger.
 * @returns ključevi bedževa dodeljenih BAŠ SADA (za toast + confetti), u
 *   redosledu iz kataloga. Prazan niz ako nema ničeg novog ili je pukao upit.
 */
export async function checkAndAwardBadges(
  userId: string,
  options: AwardOptions,
): Promise<BadgeKey[]> {
  try {
    const candidates = await candidatesFor(userId, options)
    if (candidates.length === 0) return []

    const inserted = await db
      .insert(badges)
      .values(candidates.map((badgeKey) => ({ userId, badgeKey })))
      .onConflictDoNothing({ target: [badges.userId, badges.badgeKey] })
      .returning({ badgeKey: badges.badgeKey })

    return sortBadgeKeys(inserted.map((r) => r.badgeKey))
  } catch (err) {
    console.error('[badges] dodela bedževa nije uspela:', err)
    return []
  }
}
