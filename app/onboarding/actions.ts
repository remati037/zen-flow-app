'use server'

import { revalidatePath } from 'next/cache'

import { createAction } from '@/lib/actions/safe-action'
import { ActionError } from '@/lib/actions/types'
import { checkAndAwardBadges } from '@/lib/badges/award'
import { db, focusQuizResults, profiles, supply } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { belgradeToday } from '@/lib/dates'
import { CAPSULES_PER_PACKAGE, estimateRunoutDate } from '@/lib/protocol/dosing'
import { scoreFocusQuiz } from '@/lib/quiz/focus-quiz'
import { completeOnboardingSchema } from '@/lib/validations/onboarding'

/**
 * Završetak onboardinga: upisuje protokol, doze, baseline focus score i
 * inicijalne zalihe; obeležava `onboardingCompleted = true`.
 *
 * Vraća `newBadges` (`protokol-zapocet` na prvom prolazu) — celebration ekran
 * u koraku 1.13 se kači na taj rezultat.
 *
 * PRISTUP: akcija NIJE izuzeta iz gejta u `createAction` (`allowInactive` ostaje default).
 * Proveren je redosled: Clerk `user.created` webhook kreira profil sa `access_status`
 * `inactive` i ODMAH ga osveži kroz `refreshAccessStatusForEmail` — status dakle postoji
 * pre nego što korisnik uopšte vidi wizard, a `/onboarding/page.tsx` i sam preusmerava
 * `inactive` korisnika na `/nemas-pristup`. Izuzimanje bi zato bilo čista rupa: neko bez
 * porudžbine bi mogao da napravi nalog, pozove ovu akciju i inicijalizuje sebi protokol,
 * zalihe i bedž.
 *
 * JEDNOKRATNO: `/onboarding` stranica preusmerava završene korisnike, ali akcija je
 * direktno pozivljiva (server action endpoint), a ponovni prolaz bi RESETOVAO zalihe
 * na `packages × 60`, upisao drugi `focus_quiz_results` red za isti dan i pomerio
 * `protocolStartDate` — što briše streak istoriju. Zato guard ide i ovde, na serveru.
 */
export const completeOnboarding = createAction(
  completeOnboardingSchema,
  async (data, { profile }) => {
    if (profile.onboardingCompleted) {
      throw new ActionError('Onboarding je već završen.')
    }

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

    const newBadges = await checkAndAwardBadges(profile.id, { trigger: 'onboarding' })

    revalidatePath('/dashboard')
    revalidatePath('/bedzevi')

    return { newBadges }
  },
)
