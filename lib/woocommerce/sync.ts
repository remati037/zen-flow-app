import 'server-only'

import { eq, sql } from 'drizzle-orm'

import { db, orders, profiles, supply } from '@/lib/db'
import { belgradeToday } from '@/lib/dates'
import { estimateRunoutDate } from '@/lib/protocol/dosing'
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
   * Webhook: `true` (nova kupovina = nove kapsule). Backfill istorijskih porudžbina: `false`
   * (istorija ne sme retroaktivno da naduva zalihe). Top-up ide SAMO na `created` grani.
   */
  topUpSupply?: boolean
}

/**
 * Naduva zalihe korisnika za `capsulesTotal` iz nove porudžbine i recompute-uje istek.
 * Vezuje porudžbinu (email) za profil (userId). Bezbedno preskače ako:
 *  - profil za email još ne postoji (webhook stigao pre Clerk registracije), ili
 *  - supply red ne postoji (profil nije završio onboarding — onboarding ga seed-uje).
 * Nikad ne baca — greška ovde ne sme da obori webhook/backfill.
 *
 * Poređenje mejla je case-insensitive: `orders.email` normalizujemo u lowercase, ali
 * `profiles.email` dolazi iz Clerk-a u proizvoljnom case-u (`Marko@Primer.rs`) — striktno
 * `=` je tiho preskakalo top-up baš za te korisnike.
 */
async function topUpSupplyForEmail(email: string, capsulesTotal: number): Promise<void> {
  if (capsulesTotal <= 0) return
  const normalized = email.trim().toLowerCase()
  try {
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(sql`lower(${profiles.email}) = ${normalized}`)
      .limit(1)
    if (!profile) return // Nema koga da naduvamo; supply se seed-uje na onboardingu.

    const [supplyRow] = await db
      .select({ capsulesRemaining: supply.capsulesRemaining })
      .from(supply)
      .where(eq(supply.userId, profile.id))
      .limit(1)
    if (!supplyRow) {
      console.warn(
        `[woo-sync] Top-up preskočen za ${normalized} — supply red ne postoji (nezavršen onboarding).`,
      )
      return
    }

    const capsulesRemaining = supplyRow.capsulesRemaining + capsulesTotal
    await db
      .update(supply)
      .set({
        capsulesRemaining,
        estimatedRunoutDate: estimateRunoutDate(belgradeToday(), capsulesRemaining),
        updatedAt: new Date(),
      })
      .where(eq(supply.userId, profile.id))
  } catch (err) {
    console.error('[woo-sync] top-up zaliha nije uspeo za', normalized, err)
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
    console.info(`[woo-sync] Porudžbina ${wooOrderId} opozvana (${status}) — pristup se preračunava.`)
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
    console.warn(
      `[woo-sync] Porudžbina ${wooOrderId} (${email}) preskočena — nijedan poznat ZenFlow SKU. ` +
        `Viđeni SKU-ovi: ${seenSkus.length ? seenSkus.join(', ') : '(nijedan)'}`,
    )
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
    await topUpSupplyForEmail(email, values.capsulesTotal)
  }

  return { result: created ? 'created' : 'updated', wooOrderId, email }
}
