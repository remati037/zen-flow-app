import 'server-only'

import { eq } from 'drizzle-orm'

import { db, orders } from '@/lib/db'
import { resolveProductFromLineItems } from '@/lib/woocommerce/products'
import { wooOrderSchema, type WooOrderPayload } from '@/lib/validations/woocommerce'

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
export async function upsertOrder(raw: unknown): Promise<SyncOutcome> {
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

  return { result: existing ? 'updated' : 'created', wooOrderId, email }
}
