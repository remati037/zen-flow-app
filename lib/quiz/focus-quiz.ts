/**
 * Focus Score baseline kviz (Korak 1.4 — onboarding).
 *
 * 5 pitanja, svako na skali 1–5 (1 = veoma loše, 5 = odlično).
 * Ukupan zbir (5–25) se normalizuje na skor 0–100 i upisuje u
 * `profiles.focusScoreBaseline` + `focus_quiz_results`.
 *
 * Bez `server-only` — modul dele klijent (wizard) i server (akcija).
 */

export interface FocusQuizQuestion {
  /** Stabilan ključ (za eventualni re-kviz / trend u Fazi 2). */
  key: string
  /** Tekst pitanja (srpski, latinica). */
  prompt: string
}

export const FOCUS_QUIZ_QUESTIONS: readonly FocusQuizQuestion[] = [
  { key: 'focus', prompt: 'Koliko si u proseku fokusiran tokom radnog dana?' },
  { key: 'energy', prompt: 'Kakav ti je nivo energije tokom dana?' },
  { key: 'clarity', prompt: 'Koliko ti je um bistar i jasan?' },
  { key: 'endurance', prompt: 'Koliko dugo zadržiš koncentraciju bez pada?' },
  { key: 'morning', prompt: 'Koliko se budno i sveže osećaš ujutru?' },
] as const

/** Broj pitanja — koristi se za validaciju dužine niza odgovora. */
export const FOCUS_QUIZ_LENGTH = FOCUS_QUIZ_QUESTIONS.length

/** Skala odgovora za jedno pitanje. */
export const FOCUS_QUIZ_MIN = 1
export const FOCUS_QUIZ_MAX = 5

/** Labele skale (1–5) za UI. */
export const FOCUS_QUIZ_SCALE_LABELS = ['Veoma loše', 'Loše', 'Osrednje', 'Dobro', 'Odlično'] as const

/**
 * Normalizuje zbir odgovora (min..max po pitanju) na skor 0–100.
 * Za 5 pitanja × 1–5: zbir 5 → 0, zbir 25 → 100.
 */
export function scoreFocusQuiz(answers: number[]): number {
  const min = FOCUS_QUIZ_LENGTH * FOCUS_QUIZ_MIN
  const max = FOCUS_QUIZ_LENGTH * FOCUS_QUIZ_MAX
  const sum = answers.reduce((acc, value) => acc + value, 0)
  const clamped = Math.min(max, Math.max(min, sum))
  return Math.round(((clamped - min) / (max - min)) * 100)
}
