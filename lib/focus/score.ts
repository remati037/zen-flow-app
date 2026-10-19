/**
 * Focus Score kroz vreme — PROCENA iz ponašanja, sa kvizom kao polaznom tačkom.
 *
 * Čist modul (bez `server-only`, bez DB): koristi ga server (dashboard) i QA.
 *
 * Model prati brend poruku „efekat se gradi doslednošću i bledi kad prekineš":
 *  - `effect` (0–1) je izgrađenost efekta protokola. Svaki dan se pomera ka
 *    udelu uzetih doza tog dana: raste sporije (`ALPHA_UP`, ~2 nedelje do
 *    punog) nego što bledi (`ALPHA_DOWN`). Današnji dan ga samo diže — dan još
 *    nije gotov, pa nepopunjeno jutro ne sme da spusti skor.
 *  - `practice` (0–1) su fokus minuti u poslednjih 7 dana u odnosu na 25 min
 *    dnevno (Pomodoro blok).
 *  - Skor = polazni skor iz kviza + deo preostalog prostora do 100, ograničen na
 *    `MAX_UPLIFT` poena: 80% nosi uzimanje ZenFlow-a, 20% fokus blokovi.
 *
 * Ovo NIJE merenje ni medicinska procena — UI to kaže ispod grafikona. Skor se
 * ne pomera „sam od sebe": svaka promena je posledica zabeleženih doza i blokova.
 */

import { addDaysIso as addDays } from '@/lib/dates'

export type IsoDate = string

export const ALPHA_UP = 1 / 8
export const ALPHA_DOWN = 1 / 6
/** Koliko poena iznad polazne tačke skor može da ode. */
export const MAX_UPLIFT = 35
/** Fokus minuti dnevno koji čine „punu" praksu (jedan Pomodoro blok). */
export const PRACTICE_MIN_PER_DAY = 25
const PRACTICE_WINDOW_DAYS = 7
/** Najviše dana u seriji (grafikon). */
export const SERIES_MAX_DAYS = 120
/** Bez kviza krećemo od sredine. */
export const DEFAULT_BASELINE = 50

export interface FocusPoint {
  date: IsoDate
  score: number
}

export interface FocusTrend {
  baseline: number
  current: number
  delta: number
  /** Promena u poslednjih 7 dana. */
  trend: 'up' | 'down' | 'flat'
  trendDelta: number
  /** Izgrađenost efekta protokola, 0–100. */
  effectPct: number
  points: FocusPoint[]
}

export function computeFocusTrend(input: {
  baseline: number | null
  startDate: IsoDate | null
  today: IsoDate
  /** Broj uzetih doza po danu (0–2). */
  takenByDay: ReadonlyMap<IsoDate, number>
  /** Fokus minuti po danu. */
  focusMinByDay: ReadonlyMap<IsoDate, number>
}): FocusTrend {
  const baseline = Math.min(100, Math.max(0, Math.round(input.baseline ?? DEFAULT_BASELINE)))
  const uplift = Math.min(MAX_UPLIFT, 100 - baseline)

  const empty: FocusTrend = {
    baseline,
    current: baseline,
    delta: 0,
    trend: 'flat',
    trendDelta: 0,
    effectPct: 0,
    points: [{ date: input.today, score: baseline }],
  }
  if (!input.startDate || input.startDate > input.today) return empty

  // Serija kreće od početka protokola, najviše SERIES_MAX_DAYS unazad. Efekat se
  // ipak računa od samog početka, da odsečen grafikon ne krene od nule.
  const seriesStart =
    addDays(input.today, -(SERIES_MAX_DAYS - 1)) > input.startDate
      ? addDays(input.today, -(SERIES_MAX_DAYS - 1))
      : input.startDate

  let effect = 0
  const points: FocusPoint[] = []
  for (let day = input.startDate; day <= input.today; day = addDays(day, 1)) {
    const ratio = Math.min(2, Math.max(0, input.takenByDay.get(day) ?? 0)) / 2
    const alpha = ratio >= effect ? ALPHA_UP : ALPHA_DOWN
    const next = effect + alpha * (ratio - effect)
    effect = day === input.today ? Math.max(effect, next) : next

    let practiceMin = 0
    for (let k = 0; k < PRACTICE_WINDOW_DAYS; k++) {
      practiceMin += input.focusMinByDay.get(addDays(day, -k)) ?? 0
    }
    const practice = Math.min(1, practiceMin / (PRACTICE_MIN_PER_DAY * PRACTICE_WINDOW_DAYS))

    if (day >= seriesStart) {
      points.push({ date: day, score: Math.round(baseline + uplift * (0.8 * effect + 0.2 * practice)) })
    }
  }

  const current = points[points.length - 1]?.score ?? baseline
  const weekAgo = points[Math.max(0, points.length - 8)]?.score ?? baseline
  const trendDelta = current - weekAgo
  return {
    baseline,
    current,
    delta: current - baseline,
    trend: trendDelta >= 2 ? 'up' : trendDelta <= -2 ? 'down' : 'flat',
    trendDelta,
    effectPct: Math.round(effect * 100),
    points,
  }
}
