/**
 * Mapiranje WooCommerce proizvoda → tip protokola + broj kapsula po pakovanju.
 *
 * ⚠️ POPUNITI STVARNIM SKU-ovima iz WooCommerce-a pre puštanja u rad.
 * Ključ je `sku` (string iz Woo `line_items[].sku`).
 *
 * - `productType`: 'full'   = pun protokol (npr. starter / 1 mesec)
 *                  'refill'  = dokup (refill pakovanje)
 * - `capsulesPerPackage`: koliko kapsula sadrži JEDNO pakovanje tog SKU-a.
 */

export type ProductType = 'full' | 'refill'

export interface ProductConfig {
  productType: ProductType
  capsulesPerPackage: number
}

/**
 * SKU → konfiguracija. Dodaj/izmeni redove kako brend širi asortiman.
 * Primeri ispod su placeholder — zameni tačnim vrednostima.
 */
export const PRODUCT_MAP: Record<string, ProductConfig> = {
  // Oba pakovanja = 60 kapsula (30 dana × 2 doze dnevno).
  'NURO-001': { productType: 'full', capsulesPerPackage: 60 },
  'NURO-002': { productType: 'refill', capsulesPerPackage: 60 },
}

export interface ResolvedProduct {
  productType: ProductType
  /** Ukupan broj pakovanja poznatih ZenFlow proizvoda u porudžbini. */
  quantityPackages: number
  /** Σ (qty × capsulesPerPackage) za poznate SKU-ove. */
  capsulesTotal: number
}

export interface WooLineItem {
  sku?: string | null
  quantity?: number | null
}

/**
 * Iz `line_items` porudžbine izvuče zbirni ZenFlow proizvod.
 *
 * - Prolazi kroz stavke, mapira poznate SKU-ove preko `PRODUCT_MAP`.
 * - Sumira pakovanja i kapsule.
 * - `productType`: ako porudžbina sadrži bar jedan `full` → tretiramo kao `full`,
 *   inače `refill` (full nosi duži protokol, pa je "jači" signal za pristup).
 * - Nepoznati SKU-ovi (npr. drugi proizvodi iz shopa) se preskaču.
 *
 * Vraća `null` ako porudžbina ne sadrži nijedan poznat ZenFlow proizvod
 * (pozivalac tada preskače upsert — to nije ZenFlow kupovina).
 */
export function resolveProductFromLineItems(lineItems: WooLineItem[]): ResolvedProduct | null {
  let quantityPackages = 0
  let capsulesTotal = 0
  let hasFull = false
  let matched = false

  for (const item of lineItems) {
    const sku = item.sku?.trim()
    if (!sku) continue

    const config = PRODUCT_MAP[sku]
    if (!config) continue

    const qty = Math.max(1, item.quantity ?? 1)
    matched = true
    quantityPackages += qty
    capsulesTotal += qty * config.capsulesPerPackage
    if (config.productType === 'full') hasFull = true
  }

  if (!matched) return null

  return {
    productType: hasFull ? 'full' : 'refill',
    quantityPackages,
    capsulesTotal,
  }
}
