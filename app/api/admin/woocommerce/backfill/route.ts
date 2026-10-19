import { NextResponse } from 'next/server'

import { refreshAccessStatusForEmail } from '@/lib/access/status'
import { requireAdmin } from '@/lib/auth'
import { EVENTS, logError, logWarn } from '@/lib/observability/log'
import { getRestCredentials } from '@/lib/woocommerce/env'
import {
  REVOKED_STATUSES,
  SYNCED_STATUSES,
  upsertOrder,
  type SyncOutcome,
} from '@/lib/woocommerce/sync'

export const runtime = 'nodejs'
/** Backfill može da traje — produži dozvoljeno vreme izvršavanja. */
export const maxDuration = 300

const PER_PAGE = 100

/**
 * Jednokratni uvoz istorijskih WooCommerce porudžbina preko REST API-ja.
 *
 * Admin-gated POST. Paginira `GET /wp-json/wc/v3/orders?status=<validni + opozvani>`
 * i za svaku porudžbinu zove istu `upsertOrder()` kao webhook → bez duplikacije logike.
 *
 * Opozvani statusi se povlače namerno: ako je `order.updated` webhook za refund propušten,
 * backfill je jedini put da red u `orders` dobije tačan status (inače kupac drži VIP 60 dana).
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
  const statusParam = [...SYNCED_STATUSES, ...REVOKED_STATUSES].join(',')

  const tally = { created: 0, updated: 0, revoked: 0, skipped: 0 }
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
        logWarn(EVENTS.wooBackfillFailed, { stage: 'rest', status: res.status, page })
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
        // Istorija ne naduvava zalihe retroaktivno — osim porudžbina posle onboardinga,
        // koje je webhook propustio (vidi `topUpSupply` u `lib/woocommerce/sync.ts`).
        const outcome: SyncOutcome = await upsertOrder(order, { topUpSupply: 'after-onboarding' })
        if (outcome.result === 'skipped') {
          tally.skipped += 1
        } else {
          tally[outcome.result] += 1
          affectedEmails.add(outcome.email)
        }
      }

      page += 1
    } while (page <= totalPages)
  } catch (err) {
    logError(EVENTS.wooBackfillFailed, err, { stage: 'sync', page })
    return NextResponse.json({ error: 'Backfill failed', ...tally }, { status: 500 })
  }

  // Osveži VIP/inactive status za sve kupce čije su porudžbine upravo uvezene.
  let accessRefreshed = 0
  for (const email of affectedEmails) {
    try {
      const res = await refreshAccessStatusForEmail(email)
      if (res?.changed) accessRefreshed += 1
    } catch (err) {
      // Mejl NE ide u log (lični podatak).
      logError(EVENTS.wooBackfillFailed, err, { stage: 'refresh_access' })
    }
  }

  return NextResponse.json({ ok: true, pages: totalPages, ...tally, accessRefreshed })
}
