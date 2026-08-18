import 'server-only'

import { desc, sql } from 'drizzle-orm'

import { db, orders } from '@/lib/db'

/** Maksimalan broj porudžbina u admin tabeli — MVP nema paginaciju. */
export const ORDERS_PAGE_SIZE = 100

export type AdminOrderRow = {
  id: number
  wooOrderId: string
  email: string
  productType: 'full' | 'refill'
  quantityPackages: number
  capsulesTotal: number
  orderDate: Date
  status: string
  syncedAt: Date
}

export interface ListAdminOrdersResult {
  rows: AdminOrderRow[]
  total: number
  truncated: boolean
}

/**
 * Najnovije sinhronizovane WooCommerce porudžbine.
 *
 * Napomena: `orders` šema ne čuva novčani iznos (sync mapira samo ono što
 * pristup i zalihe traže — SKU/tip, pakovanja, kapsule). Tabela zato prikazuje
 * pakovanja i kapsule umesto iznosa; dodavanje iznosa traži migraciju + re-sync.
 */
export async function listAdminOrders(): Promise<ListAdminOrdersResult> {
  const [rows, [countRow]] = await Promise.all([
    db.select().from(orders).orderBy(desc(orders.orderDate)).limit(ORDERS_PAGE_SIZE),
    db.select({ count: sql<number>`count(*)::int` }).from(orders),
  ])

  return {
    rows,
    total: countRow?.count ?? 0,
    truncated: (countRow?.count ?? 0) > ORDERS_PAGE_SIZE,
  }
}
