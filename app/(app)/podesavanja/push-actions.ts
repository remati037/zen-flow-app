'use server'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { ActionError } from '@/lib/actions/types'
import { createAction } from '@/lib/actions/safe-action'
import { db, pushSubscriptions } from '@/lib/db'
import { PUSH_ENDPOINT_TAKEN_ERROR } from '@/lib/push/endpoint'
import { deletePushSubscriptionSchema, savePushSubscriptionSchema } from '@/lib/validations/push'

/**
 * Upsert Web Push pretplate za trenutnog korisnika.
 *
 * Ključ je jedinstveni `endpoint` — isti uređaj/browser ne pravi duplikate, a ako
 * se p256dh/auth promene (re-subscribe), osvežimo ih. `last_seen_at` se dira na
 * svaki poziv: ova akcija se zove i pri svakom ulasku u app (re-upsert), pa je
 * to jedini pouzdan dokaz da uređaj još tvrdi da je pretplaćen.
 *
 * ZAŠTO `where ... = excluded.user_id`, a ne prosto `set user_id = ...`:
 * ranije je `on conflict do update set { userId }` bezuslovno PREUZIMAO tuđi red.
 * Ko god pošalje endpoint drugog korisnika (a endpoint procuri kroz deljen uređaj,
 * log, ili exportovan `PushSubscription`) preusmerio bi njegove podsetnike na sebe
 * — i, gore, njegov uređaj bi prestao da ih dobija. Uslov na `do update` čini
 * izjavu no-op kad se vlasnik ne poklapa: `returning` vrati 0 redova, tuđi red
 * ostaje netaknut, a akcija vrati grešku.
 *
 * Odbijanje (a ne scoped unique `(user_id, endpoint)`) je namerno: sa scoped
 * unique-om bi ISTI fizički uređaj mogao da stoji pod dva naloga, pa bi podsetnici
 * korisnika A i dalje stizali na uređaj koji je sad korisnikov B — curenje tuđih
 * podataka (niz, zalihe) na tuđi ekran. Slučaj deljenog uređaja se rešava na
 * klijentu: `lib/push/client.ts` na ovu grešku odjavi pretplatu i napravi svežu,
 * a push servis tada izdaje NOV endpoint. Stari red korisnika A se sam počisti
 * kad push servis na sledećem slanju vrati 410.
 *
 * Jedna SQL izjava (neon-http nema `db.transaction()`) — provera vlasništva i
 * upis ne smeju da budu dva koraka, inače se između njih uvuče trka.
 */
export const savePushSubscription = createAction(
  savePushSubscriptionSchema,
  async (data, { profile }) => {
    const res = await db.execute<{ id: number }>(sql`
      insert into ${pushSubscriptions} ("user_id", "endpoint", "p256dh", "auth", "last_seen_at")
      values (${profile.id}, ${data.endpoint}, ${data.keys.p256dh}, ${data.keys.auth}, now())
      on conflict ("endpoint") do update set
        "p256dh" = excluded."p256dh",
        "auth" = excluded."auth",
        "last_seen_at" = now()
      where ${pushSubscriptions}."user_id" = excluded."user_id"
      returning "id"
    `)

    if (res.rows.length === 0) {
      throw new ActionError(PUSH_ENDPOINT_TAKEN_ERROR, { endpoint: [PUSH_ENDPOINT_TAKEN_ERROR] })
    }

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
