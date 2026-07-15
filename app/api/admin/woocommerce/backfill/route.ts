import { NextResponse } from 'next/server'

import { refreshAccessStatusForEmail } from '@/lib/access/status'
import { requireAdmin } from '@/lib/auth'
import { getRestCredentials } from '@/lib/woocommerce/env'
import { SYNCED_STATUSES, upsertOrder, type SyncOutcome } from '@/lib/woocommerce/sync'

export const runtime = 'nodejs'
/** Backfill može da traje — produži dozvoljeno vreme izvršavanja. */
export const maxDuration = 300

const PER_PAGE = 100

/**
 * Jednokratni uvoz istorijskih WooCommerce porudžbina preko REST API-ja.
 *
 * Admin-gated POST. Paginira `GET /wp-json/wc/v3/orders?status=processing,completed`
 * i za svaku porudžbinu zove istu `upsertOrder()` kao webhook → bez duplikacije logike.
 *
 * Pokretanje (kao ulogovan admin):
 *   POST /api/admin/woocommerce/backfill
 */
export async function POST() {
  try {
    await requireAdmin()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FORBIDDEN'
    return new NextResponse(msg, { status: msg === 'UNAUTHENTICATED' ? 401 : 403 })
  }

  let creds
  try {
    creds = getRestCredentials()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Missing WooCommerce credentials'
    return new NextResponse(msg, { status: 500 })
  }

  const authHeader = `Basic ${Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString('base64')}`
  const statusParam = SYNCED_STATUSES.join(',')

  const tally = { created: 0, updated: 0, skipped: 0 }
  // Jedinstveni mejlovi upsert-ovanih porudžbina → access_status osvežavamo jednom po kupcu na kraju.
  const affectedEmails = new Set<string>()
  let page = 1
  let totalPages = 1

  try {
    do {
      const url = new URL(`${creds.storeUrl}/wp-json/wc/v3/orders`)
      url.searchParams.set('status', statusParam)
      url.searchParams.set('per_page', String(PER_PAGE))
      url.searchParams.set('page', String(page))

      const res = await fetch(url, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
      })

      if (!res.ok) {
        const body = await res.text()
        console.error(`[woo-backfill] REST greška ${res.status} na strani ${page}:`, body)
        return NextResponse.json(
          { error: `WooCommerce API ${res.status}`, page, ...tally },
          { status: 502 },
        )
      }

      // Woo vraća ukupan broj strana u headeru X-WP-TotalPages.
      if (page === 1) {
        totalPages = Number(res.headers.get('x-wp-totalpages')) || 1
      }

      const batch = (await res.json()) as unknown[]
      for (const order of batch) {
        // Istorijske porudžbine NE naduvavaju zalihe — top-up važi samo za žive webhook-e.
        const outcome: SyncOutcome = await upsertOrder(order, { topUpSupply: false })
        if (outcome.result === 'created') {
          tally.created += 1
          affectedEmails.add(outcome.email)
        } else if (outcome.result === 'updated') {
          tally.updated += 1
          affectedEmails.add(outcome.email)
        } else tally.skipped += 1
      }

      page += 1
    } while (page <= totalPages)
  } catch (err) {
    console.error('[woo-backfill] neočekivana greška:', err)
    return NextResponse.json({ error: 'Backfill failed', ...tally }, { status: 500 })
  }

  // Osveži VIP/inactive status za sve kupce čije su porudžbine upravo uvezene.
  let accessRefreshed = 0
  for (const email of affectedEmails) {
    try {
      const res = await refreshAccessStatusForEmail(email)
      if (res?.changed) accessRefreshed += 1
    } catch (err) {
      console.error('[woo-backfill] osvežavanje access_status nije uspelo za', email, err)
    }
  }

  return NextResponse.json({ ok: true, pages: totalPages, ...tally, accessRefreshed })
}
