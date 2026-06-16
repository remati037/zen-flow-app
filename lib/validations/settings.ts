import { z } from 'zod'

/** Vreme u 'HH:MM' formatu (24h), kompatibilno sa Postgres `time` kolonom. */
const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Vreme mora biti u formatu HH:MM.')

/**
 * Ažuriranje podešavanja protokola/profila.
 * Sva polja su opciona — šalje se samo ono što se menja.
 */
export const updateSettingsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  doseMorningTime: timeString.optional(),
  doseEveningTime: timeString.optional(),
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
