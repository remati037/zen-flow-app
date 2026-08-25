import { z } from 'zod'

import { timeString } from './common'

/**
 * Ažuriranje podešavanja protokola/profila.
 * Sva polja su opciona — šalje se samo ono što se menja.
 */
export const updateSettingsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  doseMorningTime: timeString.optional(),
  doseEveningTime: timeString.optional(),
  /**
   * Prijem ALERT mejlova (low-stock). Isti prekidač koji gasi i `List-Unsubscribe`
   * iz samog mejla — jedna kolona, dva ulaza (V10). Ne dira welcome mejl ni push.
   */
  emailAlerts: z.boolean().optional(),
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
