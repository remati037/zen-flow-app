import { z } from 'zod'

import { addDaysIso, belgradeToday } from '@/lib/dates'
import { FOCUS_QUIZ_LENGTH, FOCUS_QUIZ_MAX, FOCUS_QUIZ_MIN } from '@/lib/quiz/focus-quiz'
import { timeString } from './common'

/**
 * Koliko unazad sme da se datira početak protokola. Bez granice je `startDate`
 * proizvoljan: dovoljno daleko unazad pomera coverage/streak račun (a u budućnost
 * pravi protokol koji još nije počeo).
 */
export const MAX_START_BACKDATE_DAYS = 60

/**
 * Završetak onboardinga (Korak 1.4): setup protokola + doze + Focus Score kviz.
 *
 * `startDate` je ograničen na [danas − 60, danas] po BEOGRADSKOM danu — ista granica
 * važi i na klijentu (šema je client-safe) i na serveru.
 */
export const completeOnboardingSchema = z.object({
  packages: z.coerce.number().int().min(1).max(20),
  startDate: z.iso
    .date() // 'YYYY-MM-DD'
    .refine((d) => d <= belgradeToday(), {
      message: 'Početak protokola ne može biti u budućnosti.',
    })
    .refine((d) => d >= addDaysIso(belgradeToday(), -MAX_START_BACKDATE_DAYS), {
      message: `Početak protokola može biti najviše ${MAX_START_BACKDATE_DAYS} dana unazad.`,
    }),
  doseMorningTime: timeString,
  doseEveningTime: timeString,
  quizAnswers: z
    .array(z.number().int().min(FOCUS_QUIZ_MIN).max(FOCUS_QUIZ_MAX))
    .length(FOCUS_QUIZ_LENGTH),
})

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>
