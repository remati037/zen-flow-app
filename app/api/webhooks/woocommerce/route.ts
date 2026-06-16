import crypto from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'

import { getWebhookSecret } from '@/lib/woocommerce/env'
import { upsertOrder } from '@/lib/woocommerce/sync'

export const runtime = 'nodejs'

/**
 * WooCommerce webhook — sinhronizuje porudžbine u `orders`.
 *
 * Topic: `order.created` + `order.updated` (sync na processing/completed — vidi SYNCED_STATUSES).
 * Potpis: WooCommerce šalje base64 HMAC-SHA256 sirovog tela u headeru `x-wc-webhook-signature`,
 * sa secret-om iz WOO_WEBHOOK_SECRET. Verifikujemo timing-safe poređenjem.
 *
 * Ruta je javna preko middleware matchera `/api/webhooks(.*)`.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-wc-webhook-signature')

  // WooCommerce pri kreiranju/aktivaciji webhook-a šalje test "ping" preko deliver_ping():
  // telo je `{"webhook_id": N}` i NEMA potpis. Mora da vrati 200 da bi se webhook aktivirao.
  if (!signature) {
    if (rawBody) {
      try {
        const ping = JSON.parse(rawBody) as Record<string, unknown>
        if ('webhook_id' in ping) {
          return NextResponse.json({ received: true, ping: true })
        }
      } catch {
        // padne dole na 401
      }
    }
    return new NextResponse('Missing signature', { status: 401 })
  }

  let expected: string
  try {
    expected = crypto.createHmac('sha256', getWebhookSecret()).update(rawBody, 'utf8').digest('base64')
  } catch (err) {
    console.error('[woo-webhook] greška pri računanju potpisa:', err)
    return new NextResponse('Server misconfigured', { status: 500 })
  }

  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  try {
    const outcome = await upsertOrder(payload)
    // Uvek 200 na poznate no-op slučajeve da Woo ne retry-uje beskonačno.
    return NextResponse.json({ received: true, outcome })
  } catch (err) {
    console.error('[woo-webhook] upsert greška:', err)
    // 500 → Woo će ponoviti isporuku (prolazna DB greška).
    return new NextResponse('Sync failed', { status: 500 })
  }
}
