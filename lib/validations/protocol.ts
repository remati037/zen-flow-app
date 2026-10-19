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

/**
 * Check-in iz notifikacije (`/api/push/checkin`). Korisnik se NE uzima iz sesije
 * nego iz potpisanog tokena — zato je `userId` deo tela, a token ga overava.
 */
export const pushCheckinSchema = z.object({
  userId: z.string().min(1).max(100),
  date: z.iso.date(),
  dose: z.enum(doseEnum.enumValues),
  token: z.string().regex(/^[0-9a-f]{64}$/),
})
