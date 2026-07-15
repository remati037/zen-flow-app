'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { createAction } from '@/lib/actions/safe-action'
import { db, pushSubscriptions } from '@/lib/db'
import { deletePushSubscriptionSchema, savePushSubscriptionSchema } from '@/lib/validations/push'

/**
 * Upsert Web Push pretplate za trenutnog korisnika.
 * Ključ je jedinstveni `endpoint` — isti uređaj/browser ne pravi duplikate,
 * a ako se p256dh/auth promene (re-subscribe), osvežimo ih.
 */
export const savePushSubscription = createAction(
  savePushSubscriptionSchema,
  async (data, { profile }) => {
    await db
      .insert(pushSubscriptions)
      .values({
        userId: profile.id,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: profile.id,
          p256dh: data.keys.p256dh,
          auth: data.keys.auth,
        },
      })

    revalidatePath('/podesavanja')
  },
)

/**
 * Briše pretplatu po endpoint-u (scoped na trenutnog korisnika).
 */
export const deletePushSubscription = createAction(
  deletePushSubscriptionSchema,
  async (data, { profile }) => {
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, data.endpoint),
          eq(pushSubscriptions.userId, profile.id),
        ),
      )

    revalidatePath('/podesavanja')
  },
)
