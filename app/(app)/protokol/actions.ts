'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'

import { createAction } from '@/lib/actions/safe-action'
import { db, protocolLogs, supply } from '@/lib/db'
import { addDaysIso, belgradeToday } from '@/lib/dates'
import { CAPSULES_PER_DOSE, estimateRunoutDate } from '@/lib/protocol/dosing'
import { getProtocolState } from '@/lib/protocol/queries'
import { logDoseSchema } from '@/lib/validations/protocol'

/**
 * Check-in jedne doze: upsert u `protocol_logs` + usklađivanje zaliha u istoj
 * akciji. Uzimanje doze troši 2 kapsule; undo (taken→skipped) ih vraća.
 * Idempotentno — ponovni isti status ne menja zalihe (delta 0).
 */
export const logDose = createAction(logDoseSchema, async (data, { profile }) => {
  const today = belgradeToday()
  const yesterday = addDaysIso(today, -1)
  if (data.date !== today && data.date !== yesterday) {
    throw new Error('Check-in je moguć samo za danas ili juče.')
  }

  // Prethodni status (pre upserta) — određuje da li menjamo zalihe.
  const [prev] = await db
    .select({ status: protocolLogs.status })
    .from(protocolLogs)
    .where(
      and(
        eq(protocolLogs.userId, profile.id),
        eq(protocolLogs.date, data.date),
        eq(protocolLogs.dose, data.dose),
      ),
    )
    .limit(1)

  const takenAt = data.status === 'taken' ? new Date() : null

  await db
    .insert(protocolLogs)
    .values({
      userId: profile.id,
      date: data.date,
      dose: data.dose,
      status: data.status,
      takenAt,
    })
    .onConflictDoUpdate({
      target: [protocolLogs.userId, protocolLogs.date, protocolLogs.dose],
      set: { status: data.status, takenAt },
    })

  // Zalihe: uzeta doza troši kapsule, undo ih vraća. delta = (bilo) − (biće).
  const wasCounted = prev?.status === 'taken'
  const willCount = data.status === 'taken'
  const delta = (Number(wasCounted) - Number(willCount)) * CAPSULES_PER_DOSE

  const [supplyRow] = await db
    .select({ capsulesRemaining: supply.capsulesRemaining })
    .from(supply)
    .where(eq(supply.userId, profile.id))
    .limit(1)

  let capsulesRemaining = supplyRow?.capsulesRemaining ?? 0
  if (supplyRow && delta !== 0) {
    capsulesRemaining = Math.max(0, capsulesRemaining + delta)
    await db
      .update(supply)
      .set({
        capsulesRemaining,
        estimatedRunoutDate: estimateRunoutDate(today, capsulesRemaining),
        updatedAt: new Date(),
      })
      .where(eq(supply.userId, profile.id))
  }

  const { streak } = await getProtocolState(profile)

  revalidatePath('/protokol')
  revalidatePath('/dashboard')
  revalidatePath('/zalihe')

  // newBadges ostaje prazan do koraka 1.11 (award engine).
  return { streak, capsulesRemaining, newBadges: [] as string[] }
})
