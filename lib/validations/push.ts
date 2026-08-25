import { z } from 'zod'

import {
  MAX_PUSH_ENDPOINT_LENGTH,
  PUSH_ENDPOINT_ERROR,
  isAllowedPushEndpoint,
} from '@/lib/push/endpoint'

/**
 * Oblik koji vraća browser `PushSubscription.toJSON()`:
 *   { endpoint, expirationTime, keys: { p256dh, auth } }
 * Uzimamo samo ono što nam treba za slanje.
 *
 * `endpoint` NIJE bilo koji URL: server kasnije radi POST na tu adresu (`web-push`),
 * pa slobodan URL = blind SSRF. Allowlist je u `lib/push/endpoint.ts`.
 */
export const savePushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(MAX_PUSH_ENDPOINT_LENGTH)
    .refine(isAllowedPushEndpoint, { message: PUSH_ENDPOINT_ERROR }),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
})

export type SavePushSubscriptionInput = z.infer<typeof savePushSubscriptionSchema>

/**
 * Brisanje pretplate — identifikujemo je po jedinstvenom endpoint-u.
 *
 * Namerno BEZ allowlist-a: brisanje je scoped na `userId` i ne pravi nijedan
 * odlazni zahtev, a redovi upisani pre allowlist-a inače ne bi mogli da se obrišu
 * (korisnik bi zauvek ostao sa pretplatom koju ne može da ukloni iz UI-a).
 */
export const deletePushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(MAX_PUSH_ENDPOINT_LENGTH),
})

export type DeletePushSubscriptionInput = z.infer<typeof deletePushSubscriptionSchema>

/**
 * Rotacija endpoint-a — telo koje service worker šalje na `pushsubscriptionchange`.
 *
 * `oldEndpoint` je NAMERNO bez allowlist-a, iz istog razloga kao kod brisanja:
 * on je samo ključ za pronalaženje reda i ne izaziva nijedan odlazni zahtev, a
 * pretplata upisana pre allowlist-a inače ne bi mogla ni da se migrira ni da se
 * ukloni. `subscription.endpoint` JESTE allowlist-ovan — na njega server posle
 * radi POST (`web-push`), pa je slobodan URL blind SSRF.
 */
export const rotatePushSubscriptionSchema = z.object({
  oldEndpoint: z.string().url().max(MAX_PUSH_ENDPOINT_LENGTH),
  subscription: savePushSubscriptionSchema,
})

export type RotatePushSubscriptionInput = z.infer<typeof rotatePushSubscriptionSchema>
