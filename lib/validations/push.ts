import { z } from 'zod'

/**
 * Oblik koji vraća browser `PushSubscription.toJSON()`:
 *   { endpoint, expirationTime, keys: { p256dh, auth } }
 * Uzimamo samo ono što nam treba za slanje.
 */
export const savePushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

export type SavePushSubscriptionInput = z.infer<typeof savePushSubscriptionSchema>

/** Brisanje pretplate — identifikujemo je po jedinstvenom endpoint-u. */
export const deletePushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
})

export type DeletePushSubscriptionInput = z.infer<typeof deletePushSubscriptionSchema>
