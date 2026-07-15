import 'server-only'

import { eq } from 'drizzle-orm'

import { db, orders, profiles, supply } from '@/lib/db'
import { belgradeToday } from '@/lib/dates'
import { estimateRunoutDate } from '@/lib/protocol/dosing'
import { resolveProductFromLineItems } from '@/lib/woocommerce/products'
import { wooOrderSchema, type WooOrderPayload } from '@/lib/validations/woocommerce'

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
 */
async function topUpSupplyForEmail(email: string, capsulesTotal: number): Promise<void> {
  if (capsulesTotal <= 0) return
  try {
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.email, email))
      .limit(1)
    if (!profile) return // Nema koga da naduvamo; supply se seed-uje na onboardingu.

    const [supplyRow] = await db
      .select({ capsulesRemaining: supply.capsulesRemaining })
      .from(supply)
      .where(eq(supply.userId, profile.id))
      .limit(1)
    if (!supplyRow) {
      console.warn(
        `[woo-sync] Top-up preskočen za ${email} — supply red ne postoji (nezavršen onboarding).`,
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
    console.error('[woo-sync] top-up zaliha nije uspeo za', email, err)
  }
}

/**
 * Statusi porudžbine koji se računaju kao validna kupovina za pristup.
 * Sync: `processing` (plaćeno) i `completed` (poslato/završeno).
 */
export const SYNCED_STATUSES = ['processing', 'completed'] as const

export type SyncOutcome =
  | { result: 'created' | 'updated'; wooOrderId: string; email: string }
  | { result: 'skipped'; reason: 'status' | 'no-email' | 'no-product' | 'invalid'; wooOrderId?: string }

/**
 * Upsertuje jednu WooCommerce porudžbinu u `orders`.
 *
 * Koristi se i iz webhook rute i iz backfill rute — jedini izvor istine za
 * mapiranje payload-a → red u bazi.
 *
 * Pravila:
 * - Validira payload (zod). Nevalidan → `skipped: invalid`.
 * - Sinhronizuje samo `processing`/`completed` statuse → ostalo `skipped: status`.
 * - Bez email-a ili bez poznatog ZenFlow proizvoda → preskače (nije relevantna kupovina).
 * - Upsert po `woo_order_id` (unique): ponovni event ažurira status/podatke.
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

  if (!SYNCED_STATUSES.includes(order.status as (typeof SYNCED_STATUSES)[number])) {
    return { result: 'skipped', reason: 'status', wooOrderId }
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

  // Datum porudžbine: prioritet plaćanju, pa kreiranju, pa "sada".
  const dateSource = order.date_paid || order.date_created
  const orderDate = dateSource ? new Date(dateSource) : new Date()

  const values = {
    wooOrderId,
    email,
    productType: product.productType,
    quantityPackages: product.quantityPackages,
    capsulesTotal: product.capsulesTotal,
    orderDate,
    status: order.status,
  }

  // Pre-provera postojanja radi tačnog created/updated izveštaja (bitno za backfill).
  const [existing] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.wooOrderId, wooOrderId))
    .limit(1)

  await db
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

  // Top-up zaliha samo kad je porudžbina NOVA (insert grana). Replay `order.updated`
  // webhooka na isti wooOrderId pada u `updated` granu → bez dupliranja kapsula.
  if (!existing && topUpSupply) {
    await topUpSupplyForEmail(email, values.capsulesTotal)
  }

  return { result: existing ? 'updated' : 'created', wooOrderId, email }
}
