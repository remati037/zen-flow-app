/**
 * Win-back — pravila za kupce kojima je istekao pristup. Čist modul (bez
 * `server-only`), da ga QA vozi pod zamrznutim datumom.
 *
 * Do Sprinta 3 kupac kome istekne 60-dnevni prozor nije dobijao NIŠTA: oba cron-a
 * preskaču `inactive` korisnike, a `/nemas-pristup` mu je govorio „Nismo pronašli
 * porudžbinu", što je za povratnog kupca netačno. Ovo je trenutak kad je ponovna
 * kupovina najverovatnija — i najjeftinija.
 */

/** Tri poruke po isteku, svaka u svom prozoru (dani od isteka pristupa). */
export const WINBACK_STAGES = [
  { stage: 1, from: 1, to: 7 },
  { stage: 2, from: 7, to: 14 },
  { stage: 3, from: 21, to: 28 },
] as const

export type WinbackStage = (typeof WINBACK_STAGES)[number]['stage']

export type WinbackType = `winback_${WinbackStage}`

export function winbackType(stage: WinbackStage): WinbackType {
  return `winback_${stage}`
}

/**
 * Faza za `daysSinceExpiry` (beogradski dani od POSLEDNJEG dana pristupa), ili `null`.
 *
 * Svaka faza ima ograničen prozor [from, to): ako cron propusti dan, sledeći run
 * je i dalje pogađa, ali kupac koji je istekao pre pola godine ne dobija ništa.
 * Bez gornje granice bi prvo puštanje ove funkcije poslalo mejl SVIM bivšim
 * kupcima odjednom — to je spam talas, ne win-back.
 */
export function winbackStageFor(daysSinceExpiry: number): WinbackStage | null {
  const hit = WINBACK_STAGES.find((s) => daysSinceExpiry >= s.from && daysSinceExpiry < s.to)
  return hit ? hit.stage : null
}
