import 'server-only'

import { eq, sql } from 'drizzle-orm'

import { db, focusQuizResults, orders, profiles, supply } from '@/lib/db'
import { EVENTS, logError, logInfo, logWarn } from '@/lib/observability/log'
import { BELGRADE_TZ, belgradeToday } from '@/lib/dates'
import { CAPSULES_PER_DAY, LOW_STOCK_THRESHOLD } from '@/lib/protocol/dosing'
import { classifyOrderStatus, resolveOrderDate, wasInserted } from '@/lib/woocommerce/order-rules'
import { resolveProductFromLineItems } from '@/lib/woocommerce/products'
import { wooOrderSchema, type WooOrderPayload } from '@/lib/validations/woocommerce'

// Statusi žive u čistom modulu (testabilno iz QA harness-a); re-eksport da pozivaoci
// `sync.ts`-a (backfill) ne moraju da znaju gde tačno stoje.
export { REVOKED_STATUSES, SYNCED_STATUSES } from '@/lib/woocommerce/order-rules'

/** Opcije za `upsertOrder`. */
type UpsertOrderOptions = {
  /**
   * Da li nova porudžbina naduvava zalihe (`supply.capsulesRemaining += capsulesTotal`).
   *  - `true` (webhook): nova kupovina = nove kapsule.
   *  - `'after-onboarding'` (backfill): samo porudžbina od beogradskog dana POSLE
   *    onboardinga. Woo gasi webhook posle niza neuspeha; porudžbine koje backfill
   *    tada dovuče nikad nisu naduvale zalihe, pa je kupac koji je platio ostajao na 0
   *    i dobijao „naruči refill". Ranije porudžbine je korisnik već uračunao kroz broj
   *    pakovanja na onboardingu; isti dan je dvosmislen i preskače se (dupli top-up je
   *    gori od propuštenog — ne vidi se, a gasi alert).
   *  - `false`: bez top-up-a.
   * Top-up ide SAMO na `created` grani.
   */
  topUpSupply?: boolean | 'after-onboarding'
}

/**
 * Naduva zalihe korisnika za `capsulesTotal` iz nove porudžbine i recompute-uje istek.
 * Vezuje porudžbinu (email) za profil (userId). Bezbedno preskače ako:
 *  - profil za email još ne postoji (webhook stigao pre Clerk registracije), ili
 *  - supply red ne postoji (profil nije završio onboarding — onboarding ga seed-uje), ili
 *  - je zadat `orderedAfterOnboarding`, a porudžbina nije od dana posle onboardinga.
 * Nikad ne baca — greška ovde ne sme da obori webhook/backfill.
 *
 * JEDNA izjava, delta nad tekućom vrednošću: ranije je ovde bio select-pa-update sa
 * apsolutnom vrednošću, pa je check-in ili ručna korekcija u istom trenutku bila
 * pregažena (izgubljen upis).
 *
 * Poređenje mejla je case-insensitive: `orders.email` normalizujemo u lowercase, ali
 * `profiles.email` dolazi iz Clerk-a u proizvoljnom case-u (`Marko@Primer.rs`) — striktno
 * `=` je tiho preskakalo top-up baš za te korisnike.
 */
async function topUpSupplyForEmail(
  email: string,
  capsulesTotal: number,
  orderedAfterOnboarding?: Date,
): Promise<void> {
  if (capsulesTotal <= 0) return
  const normalized = email.trim().toLowerCase()
  const today = belgradeToday()

  // Dan onboardinga = prvi `focus_quiz_results` red (upisuje ga ISTA izjava koja
  // završava onboarding, pa postoji tačno kad postoji i `supply` red).
  const onboardingGate = orderedAfterOnboarding
    ? sql`and (${orderedAfterOnboarding.toISOString()}::timestamptz at time zone ${BELGRADE_TZ})::date > (
        select min(${focusQuizResults.date}) from ${focusQuizResults}
        where ${focusQuizResults.userId} = ${profiles.id}
      )`
    : sql``

  const newCapsules = sql`(${supply.capsulesRemaining} + ${capsulesTotal}::int)`

  try {
    const result = await db.execute<{ user_id: string | null; updated: number; eligible: number }>(sql`
      with target as (
        select ${profiles.id} as id from ${profiles}
        where lower(${profiles.email}) = ${normalized}
        limit 1
      ),
      eligible as (
        select ${profiles.id} as id from ${profiles}
        where ${profiles.id} = (select id from target) ${onboardingGate}
      ),
      updated as (
        update ${supply}
        set "capsules_remaining" = ${newCapsules},
            "estimated_runout_date" =
              ${today}::date + ceil(${newCapsules}::numeric / ${CAPSULES_PER_DAY}::int)::int,
            -- Dopuna zatvara epizodu niskih zaliha → brojač alerta na 0. Uslov je nad
            -- NOVIM stanjem, ne nad činjenicom dopune: refill od 1 kapsule ne sme da
            -- otvori novu rundu od tri alerta dok su zalihe i dalje ispod praga.
            "low_stock_alerts_sent" = case
              when ${newCapsules} > ${LOW_STOCK_THRESHOLD}::int then 0
              else ${supply.lowStockAlertsSent}
            end,
            "updated_at" = now()
        from eligible
        where ${supply.userId} = eligible.id
        returning ${supply.userId}
      )
      select
        (select id from target) as user_id,
        (select count(*) from eligible)::int as eligible,
        (select count(*) from updated)::int as updated
    `)

    const row = result.rows[0]
    const userId = row?.user_id ?? null
    if (!userId) return // Nema koga da naduvamo; supply se seed-uje na onboardingu.
    if (Number(row?.eligible ?? 0) === 0) {
      logInfo(EVENTS.wooTopUpSkipped, { userId, reason: 'before_onboarding' })
      return
    }
    if (Number(row?.updated ?? 0) === 0) {
      logWarn(EVENTS.wooTopUpSkipped, { userId, reason: 'no_supply_row' })
    }
  } catch (err) {
    // Mejl NE ide u log (lični podatak); količina nosi dovoljno konteksta.
    logError(EVENTS.wooTopUpFailed, err, { capsulesTotal })
  }
}

export type SyncOutcome =
  | { result: 'created' | 'updated' | 'revoked'; wooOrderId: string; email: string }
  | { result: 'skipped'; reason: 'status' | 'no-email' | 'no-product' | 'invalid'; wooOrderId?: string }

/**
 * Upsertuje jednu WooCommerce porudžbinu u `orders`.
 *
 * Koristi se i iz webhook rute i iz backfill rute — jedini izvor istine za
 * mapiranje payload-a → red u bazi.
 *
 * Pravila:
 * - Validira payload (zod). Nevalidan → `skipped: invalid`.
 * - `processing`/`completed` → upsert po `woo_order_id` (unique).
 * - `cancelled`/`refunded`/`failed` → ako red već postoji, samo mu se **ažurira status**
 *   (`revoked`), pa ga pristupna logika prestaje da broji. Ako red ne postoji → `skipped: status`.
 * - Ostali statusi (`pending`, `on-hold`, …) → `skipped: status`, red se ne dira.
 * - Bez email-a ili bez poznatog ZenFlow proizvoda → preskače (nije relevantna kupovina).
 *
 * Pozivalac je dužan da posle `created`/`updated`/`revoked` pozove
 * `refreshAccessStatusForEmail(outcome.email)` — status porudžbine menja pristup.
 */
export async function upsertOrder(
  raw: unknown,
  options: UpsertOrderOptions = {},
): Promise<SyncOutcome> {
  const { topUpSupply = true } = options
  const parsed = wooOrderSchema.safeParse(raw)
  if (!parsed.success) {
    return { result: 'skipped', reason: 'invalid' }
  }

  const order: WooOrderPayload = parsed.data
  const wooOrderId = String(order.id)
  // Normalizujemo status pri upisu — pristupni upiti porede sa lowercase listom.
  const status = order.status.trim().toLowerCase()
  const statusClass = classifyOrderStatus(status)

  if (statusClass === 'ignored') {
    return { result: 'skipped', reason: 'status', wooOrderId }
  }

  if (statusClass === 'revoked') {
    // Opoziv: ne pravimo red za porudžbinu koju nikad nismo sinhronizovali — samo
    // obaramo status postojećeg. Kapsule se NE oduzimaju (korisnik je fizički dobio
    // proizvod) — svesna odluka, vidi README „Poznata ograničenja".
    const [revoked] = await db
      .update(orders)
      .set({ status, syncedAt: new Date() })
      .where(eq(orders.wooOrderId, wooOrderId))
      .returning({ email: orders.email })

    if (!revoked) {
      return { result: 'skipped', reason: 'status', wooOrderId }
    }
    logInfo(EVENTS.wooOrderRevoked, { wooOrderId, status })
    return { result: 'revoked', wooOrderId, email: revoked.email }
  }

  const email = order.billing?.email?.trim().toLowerCase()
  if (!email) {
    return { result: 'skipped', reason: 'no-email', wooOrderId }
  }

  const product = resolveProductFromLineItems(order.line_items)
  if (!product) {
    const seenSkus = order.line_items
      .map((item) => item.sku?.trim())
      .filter((sku): sku is string => Boolean(sku))
    logWarn(EVENTS.wooOrderSkipped, {
      wooOrderId,
      reason: 'unknown_sku',
      seenSkus: seenSkus.length > 0 ? seenSkus.join(',') : null,
    })
    return { result: 'skipped', reason: 'no-product', wooOrderId }
  }

  const values = {
    wooOrderId,
    email,
    productType: product.productType,
    quantityPackages: product.quantityPackages,
    capsulesTotal: product.capsulesTotal,
    // GMT polja + eksplicitni 'Z' — inače večernja porudžbina padne u pogrešan beogradski dan.
    orderDate: resolveOrderDate(order),
    status,
  }

  // Jedna izjava odlučuje i insert/update i top-up: `xmax = 0` je true SAMO za red koji je
  // ova izjava stvarno insertovala. Ranije je ovde bio select-pa-insert (TOCTOU) — dva
  // paralelna webhook-a za istu porudžbinu su oba videla „ne postoji" i oba naduvala zalihe.
  const [row] = await db
    .insert(orders)
    .values(values)
    .onConflictDoUpdate({
      target: orders.wooOrderId,
      set: {
        email: values.email,
        productType: values.productType,
        quantityPackages: values.quantityPackages,
        capsulesTotal: values.capsulesTotal,
        orderDate: values.orderDate,
        status: values.status,
        syncedAt: new Date(),
      },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` })

  const created = wasInserted(row?.inserted)

  if (created && topUpSupply) {
    await topUpSupplyForEmail(
      email,
      values.capsulesTotal,
      topUpSupply === 'after-onboarding' ? values.orderDate : undefined,
    )
  }

  return { result: created ? 'created' : 'updated', wooOrderId, email }
}
