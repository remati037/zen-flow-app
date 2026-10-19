'use server'

import { revalidatePath } from 'next/cache'

import { createAction } from '@/lib/actions/safe-action'
import { ActionError } from '@/lib/actions/types'
import { mergeCustomSupplement } from '@/lib/supplements/store'
import { mergeCustomSchema } from '@/lib/validations/stack'

/** Spaja slobodan unos sa ključem kataloga (`intoKey: null` poništava). */
export const mergeCustom = createAction(
  mergeCustomSchema,
  async (data) => {
    const updated = await mergeCustomSupplement(data.name, data.intoKey)
    if (updated === 0) throw new ActionError('Nema takvog unosa.')
    revalidatePath('/admin/stack')
    return { updated }
  },
  { admin: true },
)
