'use server'

import { clerkClient } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { deleteProfileData, recordHealthConsent } from '@/lib/account/store'
import { createAction } from '@/lib/actions/safe-action'
import { EVENTS, logError, logInfo } from '@/lib/observability/log'

/**
 * Pristanak za podatke o zdravlju za nalog onboardovan pre nego što je pristanak
 * uveden (`/saglasnost`). Novi korisnici ga daju kroz `completeOnboarding`.
 */
export const giveHealthConsent = createAction(
  z.object({ consent: z.literal(true) }),
  async (_data, { profile }) => {
    await recordHealthConsent(profile.id)
    logInfo(EVENTS.healthConsentGiven, { userId: profile.id })
    revalidatePath('/dashboard')
  },
  { allowWithoutConsent: true },
)

/**
 * Trajno brisanje naloga — i povlačenje pristanka (`lib/legal.ts`).
 *
 * Redosled: prvo Clerk, pa baza. Obrnuto bi pri padu Clerk poziva ostavilo živu
 * sesiju bez profila; ovako pad baze posle Clerk-a dočisti `user.deleted` webhook
 * (isto brisanje, idempotentno). Sme i neaktivnom nalogu i nalogu bez pristanka:
 * pravo na brisanje ne zavisi ni od kupovine ni od pristanka.
 */
export const deleteAccount = createAction(
  z.object({ confirm: z.literal(true) }),
  async (_data, { profile }) => {
    try {
      const clerk = await clerkClient()
      await clerk.users.deleteUser(profile.id)
    } catch (err) {
      logError(EVENTS.accountDeleteFailed, err, { userId: profile.id, step: 'clerk' })
      throw err
    }

    try {
      await deleteProfileData(profile.id)
    } catch (err) {
      // Clerk nalog je već obrisan; webhook `user.deleted` briše isti red.
      logError(EVENTS.accountDeleteFailed, err, { userId: profile.id, step: 'db' })
    }

    logInfo(EVENTS.accountDeleted, { userId: profile.id })
  },
  { allowInactive: true, allowWithoutConsent: true },
)
