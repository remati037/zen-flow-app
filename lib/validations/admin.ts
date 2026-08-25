import { z } from 'zod'

/**
 * Admin akcije nad tuđim nalozima. `userId` je Clerk user id (`profiles.id`).
 *
 * Override namerno dozvoljava samo `vip` i `inactive` — `subscriber` je Faza 2
 * (Stripe) i ne sme se dodeljivati ručno. Ista invarijanta stoji i kao CHECK
 * u bazi (`profiles_access_override_values`).
 *
 * `auto` NIJE status nego BRISANJE override-a: nalog se vraća pod automatiku
 * (porudžbina u prozoru odlučuje). Bez ove treće vrednosti override bi bio
 * jednosmeran — admin bi mogao da ga postavi, ali nikad da ga skine.
 */

export const ACCESS_OVERRIDE_CHOICES = ['vip', 'inactive', 'auto'] as const
export type AccessOverrideChoice = (typeof ACCESS_OVERRIDE_CHOICES)[number]

export const setAccessStatusSchema = z.object({
  userId: z.string().min(1, 'Nedostaje korisnik.'),
  status: z.enum(ACCESS_OVERRIDE_CHOICES),
})

export const adminUserIdSchema = z.object({
  userId: z.string().min(1, 'Nedostaje korisnik.'),
})

export type SetAccessStatusInput = z.infer<typeof setAccessStatusSchema>
