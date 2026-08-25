'use server'

import { revalidatePath } from 'next/cache'

import { createAction } from '@/lib/actions/safe-action'
import { db, supply } from '@/lib/db'
import { belgradeToday } from '@/lib/dates'
import { LOW_STOCK_THRESHOLD, estimateRunoutDate } from '@/lib/protocol/dosing'
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

  // Epizoda niskih zaliha se ZATVARA čim zalihe pređu prag — brojač alerta se tada
  // vraća na 0, pa sledeći pad ponovo dobija punih `LOW_STOCK_MAX_ALERTS_PER_EPISODE`.
  // Reset je vezan za STANJE (kapsule iznad praga), ne za događaj „dopuna", pa ga
  // nijedan put upisa u `supply` ne može zaobići.
  const episodeReset =
    data.capsulesRemaining > LOW_STOCK_THRESHOLD ? { lowStockAlertsSent: 0 } : {}

  await db
    .insert(supply)
    .values({
      userId: profile.id,
      capsulesRemaining: data.capsulesRemaining,
      estimatedRunoutDate,
      updatedAt: new Date(),
      ...episodeReset,
    })
    .onConflictDoUpdate({
      target: supply.userId,
      set: {
        capsulesRemaining: data.capsulesRemaining,
        estimatedRunoutDate,
        updatedAt: new Date(),
        ...episodeReset,
      },
    })

  revalidatePath('/zalihe')
  revalidatePath('/dashboard')

  return { capsulesRemaining: data.capsulesRemaining, estimatedRunoutDate }
})
