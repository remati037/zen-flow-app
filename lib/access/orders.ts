import 'server-only'

import { and, desc, inArray, sql } from 'drizzle-orm'
import { cache } from 'react'

import { db, orders } from '@/lib/db'
import { SYNCED_STATUSES } from '@/lib/woocommerce/order-rules'

/**
 * Datumi svih VAŽEĆIH porudžbina za mejl, najnovija prva — JEDAN upit po zahtevu.
 *
 * Gejt pristupa (`getLatestOrderDate`) i streak (`getProtocolState` → pokrivenost)
 * čitaju iste porudžbine. Ranije su to bila dva upita u svakom renderu i u svakom
 * check-in-u; `cache()` ih spaja u jedan u okviru zahteva. Van React zahteva (cron,
 * webhook) `cache` ne pamti ništa i svaki poziv ide u bazu — isto kao ranije.
 *
 * Ključ keša je normalizovan mejl (primitiv), pa `Marko@Primer.rs` i
 * `marko@primer.rs` dele isti unos. Poređenje je case-insensitive — `orders.email`
 * je lowercase (sync.ts), a `profiles.email` dolazi iz Clerk-a u proizvoljnom case-u.
 * Otkazane/refundirane se ne broje (`SYNCED_STATUSES`).
 */
const loadValidOrderDates = cache(async (normalizedEmail: string): Promise<Date[]> => {
  const rows = await db
    .select({ orderDate: orders.orderDate })
    .from(orders)
    .where(
      and(
        sql`lower(${orders.email}) = ${normalizedEmail}`,
        inArray(orders.status, [...SYNCED_STATUSES]),
      ),
    )
    .orderBy(desc(orders.orderDate))
  return rows.map((r) => r.orderDate)
})

export function getValidOrderDates(email: string): Promise<Date[]> {
  return loadValidOrderDates(email.trim().toLowerCase())
}
