import { z } from 'zod'

/**
 * Mejl za pozivnicu / zahtev za link. Normalizuje se odmah u šemi (trim +
 * lowercase), da svaki dalji korak — poređenje sa `orders`, Clerk upit,
 * cooldown — radi nad istim oblikom.
 */
export const inviteEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Mejl je predugačak.')
  .pipe(z.email('Unesi ispravan mejl.'))

export const signUpRequestSchema = z.object({ email: inviteEmail })

export const adminInviteSchema = z.object({ email: inviteEmail })

export const invitationIdSchema = z.object({
  invitationId: z.string().min(1, 'Nedostaje pozivnica.'),
})
