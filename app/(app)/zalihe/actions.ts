'use server'

import { revalidatePath } from 'next/cache'

import { createAction } from '@/lib/actions/safe-action'
import { db, supply } from '@/lib/db'
import { belgradeToday } from '@/lib/dates'
import { estimateRunoutDate } from '@/lib/protocol/dosing'
import { updateSupplySchema } from '@/lib/validations/supply'

/**
 * Ručna korekcija preostalih kapsula (npr. korisnik prebroji staklenku).
 * Recompute-uje procenu isteka od današnjeg beogradskog dana — isti izvor "danas"
 * kao check-in u koraku 1.6. `onConflictDoUpdate` da radi i ako supply red još ne
 * postoji (odbrana, iako ga onboarding seed-uje).
 */
export const updateSupply = createAction(updateSupplySchema, async (data, { profile }) => {
  const today = belgradeToday()
  const estimatedRunoutDate = estimateRunoutDate(today, data.capsulesRemaining)

  await db
    .insert(supply)
    .values({
      userId: profile.id,
      capsulesRemaining: data.capsulesRemaining,
      estimatedRunoutDate,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: supply.userId,
      set: {
        capsulesRemaining: data.capsulesRemaining,
        estimatedRunoutDate,
        updatedAt: new Date(),
      },
    })

  revalidatePath('/zalihe')
  revalidatePath('/dashboard')

  return { capsulesRemaining: data.capsulesRemaining, estimatedRunoutDate }
})
