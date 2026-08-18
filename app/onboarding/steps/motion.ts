/**
 * Deljene motion konstante onboarding koraka (Korak 1.13).
 *
 * Vertikalne varijante koristi spoljni `AnimatePresence mode="wait"` između
 * koraka; horizontalne koriste unutrašnji slajderi (intro slajdovi, kviz).
 */

import type { Transition, Variants } from 'motion/react'

/** Brend easing (`--ease` iz globals.css) kao tuple koji motion prihvata. */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** Tranzicija između koraka wizarda — dovoljno brza da ceo flow stane u < 2 min. */
export const STEP_TRANSITION: Transition = { duration: 0.26, ease: EASE }

/** Tranzicija unutar koraka (slajd pitanja / intro slajda). */
export const SLIDE_TRANSITION: Transition = { duration: 0.24, ease: EASE }

/** Meki spring za gamifikovane elemente (progress bar, gauge, badge reveal). */
export const SPRING: Transition = { type: 'spring', stiffness: 220, damping: 28, mass: 0.7 }

/** Fade + blagi vertikalni pomak — prelaz korak → korak. */
export const stepVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
}

/**
 * Horizontalni slajd sa smerom (`custom` = 1 napred, -1 nazad).
 * Koristi se uz `AnimatePresence mode="wait" custom={direction}`.
 */
export const slideVariants: Variants = {
  initial: (direction: number) => ({ opacity: 0, x: direction * 48 }),
  animate: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -48 }),
}
