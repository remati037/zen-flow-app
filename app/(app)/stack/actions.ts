'use server'

import { revalidatePath } from 'next/cache'

import { createAction } from '@/lib/actions/safe-action'
import { ActionError } from '@/lib/actions/types'
import { belgradeToday } from '@/lib/dates'
import { matchCatalogExact } from '@/lib/supplements/search'
import {
  addSupplement as addRow,
  clearStack as clearRows,
  confirmStack as confirmRows,
  updateSupplementRow,
  type SupplementTarget,
} from '@/lib/supplements/store'
import {
  addSupplementSchema,
  clearStackSchema,
  confirmStackSchema,
  updateSupplementSchema,
} from '@/lib/validations/stack'

function refresh() {
  revalidatePath('/stack')
  revalidatePath('/dashboard')
}

export const addSupplement = createAction(addSupplementSchema, async (data, { profile }) => {
  // „Drugo" koje je zapravo kataloška stavka ("Magnezijum", "mg") ide pod ključ kataloga.
  const exact = data.customName !== undefined ? matchCatalogExact(data.customName) : undefined
  const catalogKey = data.catalogKey ?? exact?.key
  const target: SupplementTarget =
    catalogKey !== undefined ? { catalogKey } : { customName: data.customName ?? '' }

  const { id } = await addRow(
    profile.id,
    target,
    { timeOfDay: data.timeOfDay, doseNote: data.doseNote },
    belgradeToday(),
  )
  refresh()
  return { id }
})

export const updateSupplement = createAction(updateSupplementSchema, async (data, { profile }) => {
  const { id, ...patch } = data
  const ok = await updateSupplementRow(profile.id, id, patch, belgradeToday())
  if (!ok) throw new ActionError('Unos nije pronađen.')
  refresh()
})

export const confirmStack = createAction(confirmStackSchema, async (_data, { profile }) => {
  await confirmRows(profile.id, belgradeToday())
  refresh()
})

export const clearStack = createAction(clearStackSchema, async (_data, { profile }) => {
  await clearRows(profile.id)
  refresh()
})
