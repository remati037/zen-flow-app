'use server'

import { revalidatePath } from 'next/cache'

import { createAction } from '@/lib/actions/safe-action'
import { ActionError } from '@/lib/actions/types'
import { checkAndAwardBadges } from '@/lib/badges/award'
import { finalizeOnboarding } from '@/lib/onboarding/finalize'
import { belgradeToday } from '@/lib/dates'
import { estimateRunoutDate, initialCapsulesForStart } from '@/lib/protocol/dosing'
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
 * `protocolStartDate` — što briše streak istoriju. Zato guard ide i ovde, na serveru,
 * i to ATOMARNO (vidi `finalizeOnboarding` u `lib/onboarding/finalize.ts`).
 */
export const completeOnboarding = createAction(
  completeOnboardingSchema,
  async (data, { profile }) => {
    if (profile.onboardingCompleted) {
      throw new ActionError('Onboarding je već završen.')
    }

    const today = belgradeToday()
    const capsulesRemaining = initialCapsulesForStart(data.packages, data.startDate, today)
    // Od DANAS, ne od početka protokola: kapsule su već umanjene za protekle dane.
    const estimatedRunoutDate = estimateRunoutDate(today, capsulesRemaining)
    const score = scoreFocusQuiz(data.quizAnswers)

    const claimed = await finalizeOnboarding({
      userId: profile.id,
      startDate: data.startDate,
      doseMorningTime: data.doseMorningTime,
      doseEveningTime: data.doseEveningTime,
      score,
      quizAnswers: data.quizAnswers,
      capsulesRemaining,
      estimatedRunoutDate,
      today,
    })
    if (!claimed) {
      throw new ActionError('Onboarding je već završen.')
    }

    const newBadges = await checkAndAwardBadges(profile.id, { trigger: 'onboarding' })

    revalidatePath('/dashboard')
    revalidatePath('/bedzevi')

    return { newBadges }
  },
)
