'use server'

import { revalidatePath } from 'next/cache'

import { createAction } from '@/lib/actions/safe-action'
import { db, focusQuizResults, profiles, supply } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { belgradeToday } from '@/lib/dates'
import { CAPSULES_PER_PACKAGE, estimateRunoutDate } from '@/lib/protocol/dosing'
import { scoreFocusQuiz } from '@/lib/quiz/focus-quiz'
import { completeOnboardingSchema } from '@/lib/validations/onboarding'

/**
 * Završetak onboardinga: upisuje protokol, doze, baseline focus score i
 * inicijalne zalihe; obeležava `onboardingCompleted = true`.
 */
export const completeOnboarding = createAction(
  completeOnboardingSchema,
  async (data, { profile }) => {
    const capsulesRemaining = data.packages * CAPSULES_PER_PACKAGE
    const estimatedRunoutDate = estimateRunoutDate(data.startDate, capsulesRemaining)
    const score = scoreFocusQuiz(data.quizAnswers)
    const today = belgradeToday()

    await db
      .update(profiles)
      .set({
        protocolStartDate: data.startDate,
        doseMorningTime: data.doseMorningTime,
        doseEveningTime: data.doseEveningTime,
        focusScoreBaseline: score,
        onboardingCompleted: true,
      })
      .where(eq(profiles.id, profile.id))

    await db
      .insert(supply)
      .values({
        userId: profile.id,
        capsulesRemaining,
        estimatedRunoutDate,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: supply.userId,
        set: { capsulesRemaining, estimatedRunoutDate, updatedAt: new Date() },
      })

    await db.insert(focusQuizResults).values({
      userId: profile.id,
      date: today,
      score,
      answers: data.quizAnswers,
    })

    revalidatePath('/dashboard')
  },
)
