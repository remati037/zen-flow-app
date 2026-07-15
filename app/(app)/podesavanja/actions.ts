'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { createAction } from '@/lib/actions/safe-action'
import { db, profiles } from '@/lib/db'
import { updateSettingsSchema } from '@/lib/validations/settings'

/**
 * Primer server akcije — obrazac koji prate sve buduće mutacije.
 * Auth + validacija + DB update su pokriveni kroz `createAction`; handler
 * sadrži samo poslovnu logiku i dobija već validiran ulaz + `profile` iz konteksta.
 */
export const updateSettings = createAction(
  updateSettingsSchema,
  async (data, { profile }) => {
    await db
      .update(profiles)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.doseMorningTime !== undefined && { doseMorningTime: data.doseMorningTime }),
        ...(data.doseEveningTime !== undefined && { doseEveningTime: data.doseEveningTime }),
      })
      .where(eq(profiles.id, profile.id))

    revalidatePath('/podesavanja')
    // Vremena doza se odmah vide na protokolu i utiču na reminder dispatcher.
    revalidatePath('/protokol')
    revalidatePath('/dashboard')
  },
)
