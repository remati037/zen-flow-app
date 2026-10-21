'use server'

import { revalidatePath } from 'next/cache'

import { createAction } from '@/lib/actions/safe-action'
import { recordDose } from '@/lib/protocol/record-dose'
import { logDoseSchema } from '@/lib/validations/protocol'

/**
 * Check-in jedne doze iz app-a. Logika (jedna SQL izjava za log + zalihe, bedževi)
 * je u `lib/protocol/record-dose.ts` — deli je i `/api/push/checkin` (dugme
 * „Uzeto" u notifikaciji), da dva puta upisa ne mogu da se raziđu.
 */
export const logDose = createAction(logDoseSchema, async (data, { profile }) => {
  const result = await recordDose(profile, data)

  revalidatePath('/protokol')
  revalidatePath('/dashboard')
  revalidatePath('/zalihe')
  if (result.newBadges.length > 0) revalidatePath('/bedzevi')

  return result
})
