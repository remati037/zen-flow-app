'use server'

import { revalidatePath } from 'next/cache'
import { sql } from 'drizzle-orm'

import { createAction } from '@/lib/actions/safe-action'
import { ActionError } from '@/lib/actions/types'
import { checkAndAwardBadges } from '@/lib/badges/award'
import { db, protocolLogs, supply } from '@/lib/db'
import { addDaysIso, belgradeToday } from '@/lib/dates'
import { CAPSULES_PER_DAY, CAPSULES_PER_DOSE } from '@/lib/protocol/dosing'
import { getProtocolState } from '@/lib/protocol/queries'
import { logDoseSchema } from '@/lib/validations/protocol'

/** Koliko dana unazad sme da se naknadno označi doza (backfill). */
const BACKFILL_DAYS = 7

/**
 * Check-in jedne doze: upsert u `protocol_logs` + usklađivanje zaliha u JEDNOJ SQL izjavi.
 *
 * Zašto jedna izjava: neon-http nema `db.transaction()`. Ranije su ovo bila tri odvojena
 * upita (select prethodnog statusa → upsert → update zaliha), pa su dva paralelna
 * zahteva (double-tap na isto dugme) oba čitala „nema loga" i oba skidala po 2 kapsule.
 *
 * Kako je rešeno:
 *  - `on conflict do update ... where status is distinct from excluded.status` —
 *    Postgres pri konfliktu ZAKLJUČA postojeći red i uslov proverava nad NAJNOVIJOM
 *    verzijom. Ako se status ne menja, update se ne dešava i `returning` ne vraća red.
 *    Drugi tap zato prirodno daje deltu 0, bez ijednog dodatnog čitanja.
 *  - Pošto je `protocol_status` enum od dve vrednosti, vraćen red = stvarna promena,
 *    pa je prethodni status implicitan — nema potrebe da ga posebno čitamo.
 *  - `xmax = 0` razlikuje insert od update-a: prvo obeležavanje doze kao `skipped`
 *    ne sme da „vrati" kapsule koje nikad nisu potrošene.
 *  - Zalihe se menjaju SQL deltom nad tekućom vrednošću (`capsules_remaining ± 2`),
 *    ne vrednošću pročitanom ranije.
 *
 * Asimetrija clamp-a (svesna odluka, bez nove kolone): potrošnja je
 * `greatest(0, ...)`, a povraćaj se NE izvršava kad su zalihe na 0. Bez pamćenja
 * „koliko je ovaj log stvarno potrošio" ta dva slučaja (bilo 0 → clamp odsekao, i
 * bilo tačno 2 → legitimno palo na 0) posle clamp-a izgledaju identično. Biramo
 * stranu koja NIKAD ne kuje kapsule: undo na nuli ne vraća ništa. Cena je da undo
 * check-ina koji je zalihe spustio tačno na 0 „pojede" te 2 kapsule — smer koji drži
 * low-stock alert upaljen umesto da ga ugasi lažnim stanjem.
 *
 * Sitnica kod stvarno paralelnog double-tap-a: zahtev koji izgubi trku vrati
 * `capsulesRemaining` iz svog snapshot-a, pa je za jedan korak star. U bazi je
 * vrednost tačna, a `revalidatePath('/zalihe')` odmah povuče svežu — nije bug.
 */
export const logDose = createAction(logDoseSchema, async (data, { profile }) => {
  const today = belgradeToday()
  const earliest = addDaysIso(today, -BACKFILL_DAYS)
  // ISO 'YYYY-MM-DD' se poredi leksikografski = hronološki.
  if (data.date > today || data.date < earliest) {
    throw new ActionError(`Check-in je moguć samo za poslednjih ${BACKFILL_DAYS} dana.`)
  }

  const takenAt = data.status === 'taken' ? new Date().toISOString() : null

  // Uzimanje troši kapsule; undo (taken → skipped) ih vraća. Prvi upis `skipped`
  // (insert, ne tranzicija) ne dira zalihe.
  const deltaExpr =
    data.status === 'taken'
      ? sql`${-CAPSULES_PER_DOSE}::int`
      : sql`case when changed.inserted then 0 else ${CAPSULES_PER_DOSE}::int end`

  // Nova vrednost zaliha — ista CASE grana se koristi i za `estimated_runout_date`,
  // pa je izdvojena u fragment (Postgres sve SET izraze računa nad istim, zaključanim redom).
  const nextCapsules = sql`case
        when d.delta < 0 then greatest(0, ${supply.capsulesRemaining} + d.delta)
        when ${supply.capsulesRemaining} = 0 then 0
        else ${supply.capsulesRemaining} + d.delta
      end`

  const result = await db.execute<{ capsules_remaining: number }>(sql`
    with changed as (
      insert into ${protocolLogs} ("user_id", "date", "dose", "status", "taken_at")
      values (
        ${profile.id},
        ${data.date}::date,
        ${data.dose}::dose,
        ${data.status}::protocol_status,
        ${takenAt}::timestamptz
      )
      on conflict ("user_id", "date", "dose") do update
        set "status" = excluded."status", "taken_at" = excluded."taken_at"
        where ${protocolLogs.status} is distinct from excluded."status"
      returning (xmax = 0) as inserted
    ),
    delta as (
      select ${deltaExpr} as delta from changed
    ),
    updated as (
      update ${supply}
      set "capsules_remaining" = ${nextCapsules},
          "estimated_runout_date" =
            ${today}::date + ceil((${nextCapsules})::numeric / ${CAPSULES_PER_DAY}::int)::int,
          "updated_at" = now()
      from delta d
      where ${supply.userId} = ${profile.id} and d.delta <> 0
      returning ${supply.capsulesRemaining} as capsules_remaining
    )
    select coalesce(
      (select capsules_remaining from updated),
      (select ${supply.capsulesRemaining} from ${supply} where ${supply.userId} = ${profile.id}),
      0
    )::int as capsules_remaining
  `)

  const capsulesRemaining = Number(result.rows[0]?.capsules_remaining ?? 0)

  const { streak } = await getProtocolState(profile)

  // Streak je već izračunat — prosleđuje se da ga award engine ne računa ponovo.
  const newBadges = await checkAndAwardBadges(profile.id, {
    trigger: 'dose',
    currentStreak: streak.current,
  })

  revalidatePath('/protokol')
  revalidatePath('/dashboard')
  revalidatePath('/zalihe')
  if (newBadges.length > 0) revalidatePath('/bedzevi')

  return { streak, capsulesRemaining, newBadges }
})
