import { z } from 'zod'

import { FOCUS_QUIZ_LENGTH, FOCUS_QUIZ_MAX, FOCUS_QUIZ_MIN } from '@/lib/quiz/focus-quiz'
import { timeString } from './common'

/**
 * Završetak onboardinga (Korak 1.4): setup protokola + doze + Focus Score kviz.
 */
export const completeOnboardingSchema = z.object({
  packages: z.coerce.number().int().min(1).max(20),
  startDate: z.iso.date(), // 'YYYY-MM-DD'
  doseMorningTime: timeString,
  doseEveningTime: timeString,
  quizAnswers: z
    .array(z.number().int().min(FOCUS_QUIZ_MIN).max(FOCUS_QUIZ_MAX))
    .length(FOCUS_QUIZ_LENGTH),
})

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>
