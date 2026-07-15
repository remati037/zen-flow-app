/**
 * Streak logika — čista, bez DB i bez `server-only` (testabilno, client-safe).
 *
 * Core insight: efekat protokola se gradi doslednošću i bledi prekidom. Streak
 * broji uzastopne KOMPLETNE dane (obe doze uzete) — ali samo dok je korisnik
 * "pokriven" aktivnom porudžbinom. Dan bez pokrivenosti (inactive) je "frozen":
 * pauzira niz umesto da ga prekine, pa nova kupovina nastavlja tamo gde je stao.
 *
 * DB → argumenti se pripremaju u `lib/protocol/queries.ts` (server-only).
 */

import { addDaysIso } from '@/lib/dates'

export type IsoDate = string // 'YYYY-MM-DD'

/**
 * Prozor pokrivenosti u danima. MORA pratiti `VIP_WINDOW_DAYS` iz
 * `lib/access/status.ts` (isti izvor istine za pristup) — duplirano ovde jer je
 * onaj modul `server-only`, a streak logika mora ostati client-safe.
 */
export const COVERAGE_DAYS = 60

/** Koliko dana unazad najviše računamo (zaštita od beskonačne petlje). */
const MAX_LOOKBACK_DAYS = 400

export type CoveredRange = readonly [IsoDate, IsoDate] // inkluzivno [start, end]

export type DayStatus = 'complete' | 'partial' | 'missed' | 'frozen'

export interface StreakResult {
  current: number
  longest: number
  todayComplete: boolean
}

/**
 * Od datuma porudžbina pravi merge-ovane intervale pokrivenosti
 * `[orderDate, orderDate + COVERAGE_DAYS]` (inkluzivno). Preklapajući/susedni
 * intervali se spajaju u jedan.
 */
export function mergeCoveredRanges(orderDatesIso: IsoDate[]): CoveredRange[] {
  if (orderDatesIso.length === 0) return []

  const ranges = orderDatesIso
    .map((d): CoveredRange => [d, addDaysIso(d, COVERAGE_DAYS)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

  const merged: CoveredRange[] = [ranges[0]]
  for (let i = 1; i < ranges.length; i++) {
    const [start, end] = ranges[i]
    const last = merged[merged.length - 1]
    // susedni (start <= lastEnd + 1 dan) → spoji
    if (start <= addDaysIso(last[1], 1)) {
      if (end > last[1]) merged[merged.length - 1] = [last[0], end]
    } else {
      merged.push(ranges[i])
    }
  }
  return merged
}

/** Da li je dan pokriven (admin: uvek). */
export function isCovered(
  iso: IsoDate,
  ranges: CoveredRange[],
  alwaysCovered = false,
): boolean {
  if (alwaysCovered) return true
  return ranges.some(([start, end]) => iso >= start && iso <= end)
}

export interface ComputeStreakParams {
  /** Datumi ('YYYY-MM-DD') gde su OBE doze uzete. */
  completedDates: Set<IsoDate>
  coveredRanges: CoveredRange[]
  alwaysCovered?: boolean
  today: IsoDate
  /** Prvi dan protokola; null → nema protokola → prazan rezultat. */
  startDate: IsoDate | null
}

/**
 * Jedan forward pass od `startDate` (ili `today − 400d`, šta je kasnije) do
 * `today`. Pravila po danu:
 * - nepokriven → frozen: `running` netaknut (pauza), preskoči.
 * - pokriven + kompletan → `running++`.
 * - pokriven + nekompletan:
 *     - današnji dan → grace: ne resetuj (dan još nije gotov), ali ne broji.
 *     - raniji dan → prekid: `running = 0`.
 */
export function computeStreak(params: ComputeStreakParams): StreakResult {
  const { completedDates, coveredRanges, alwaysCovered = false, today, startDate } = params

  if (!startDate) {
    return { current: 0, longest: 0, todayComplete: false }
  }

  const earliest = addDaysIso(today, -MAX_LOOKBACK_DAYS)
  const from = startDate > earliest ? startDate : earliest

  let running = 0
  let longest = 0

  for (let d = from; d <= today; d = addDaysIso(d, 1)) {
    if (!isCovered(d, coveredRanges, alwaysCovered)) {
      continue // frozen — pauza
    }
    if (completedDates.has(d)) {
      running++
      if (running > longest) longest = running
    } else if (d !== today) {
      running = 0 // propušten pokriven dan prekida niz
    }
    // d === today && nekompletan → grace: ostavi running kakav jeste
  }

  return {
    current: running,
    longest,
    todayComplete: completedDates.has(today),
  }
}
