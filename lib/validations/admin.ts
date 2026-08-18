import { z } from 'zod'

/**
 * Admin akcije nad tuđim nalozima. `userId` je Clerk user id (`profiles.id`).
 *
 * Override namerno dozvoljava samo `vip` i `inactive` — `subscriber` je Faza 2
 * (Stripe) i ne sme se dodeljivati ručno.
 */

export const setAccessStatusSchema = z.object({
  userId: z.string().min(1, 'Nedostaje korisnik.'),
  status: z.enum(['vip', 'inactive']),
})

export const adminUserIdSchema = z.object({
  userId: z.string().min(1, 'Nedostaje korisnik.'),
})

export type SetAccessStatusInput = z.infer<typeof setAccessStatusSchema>
