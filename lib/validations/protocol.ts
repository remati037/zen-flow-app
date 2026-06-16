import { z } from 'zod'

import { doseEnum, protocolStatusEnum } from '@/lib/db/schema'

/**
 * Check-in jedne doze (osnova streak-a). Vrednosti za `dose`/`status`
 * dolaze direktno iz Drizzle enum-ova radi konzistentnosti sa bazom.
 */
export const logDoseSchema = z.object({
  date: z.iso.date(), // 'YYYY-MM-DD'
  dose: z.enum(doseEnum.enumValues),
  status: z.enum(protocolStatusEnum.enumValues).default('taken'),
})

export type LogDoseInput = z.infer<typeof logDoseSchema>
