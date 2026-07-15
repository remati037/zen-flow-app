/**
 * Brand confetti wrapper — koristi se za trenutke slavlja (prvi bedž, streak
 * milestone, završen onboarding). Boje su ZenFlow brand paleta.
 *
 * `canvas-confetti` se učitava dinamički (`import(...)`) da ostane client-only i
 * van SSR bundle-a — zove se tek na korisničku akciju u browseru.
 */

/** ZenFlow brand paleta za konfete: lime akcenat, ink navy, belo. */
const BRAND_COLORS = ['#DEFE9C', '#203849', '#FFFFFF']

/**
 * Ispali brand konfete. Bezbedno na serveru (no-op ako nema `window`).
 * `origin.y = 0.6` — malo iznad dna, prirodan "prsak" ka gore.
 */
export async function fireConfetti(): Promise<void> {
  if (typeof window === 'undefined') return

  const { default: confetti } = await import('canvas-confetti')

  confetti({
    particleCount: 120,
    spread: 70,
    startVelocity: 45,
    origin: { y: 0.6 },
    colors: BRAND_COLORS,
    scalar: 1.1,
    disableForReducedMotion: true,
  })
}
