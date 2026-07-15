import { and, eq, lte, ne } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { db, profiles, supply } from '@/lib/db'
import { sendLowStockEmail } from '@/lib/email/send'
import { filterNotifiedSince } from '@/lib/push/dedup'
import { sendPushToUser } from '@/lib/push/send'

export const runtime = 'nodejs'

/** Prag ispod kog se šalje alert: 14 kapsula ≈ nedelja dana na 2 doze dnevno. */
const LOW_STOCK_THRESHOLD = 14
/** Ne šalji ponovo low-stock alert ako je već poslat u zadnjih ovoliko dana (po kanalu). */
const DEDUP_DAYS = 3

/**
 * Vercel Cron — pronalazi korisnike sa niskim zalihama i šalje alert na EMAIL + PUSH.
 * Zaštićen `CRON_SECRET`-om (Vercel Cron šalje `Authorization: Bearer <secret>`).
 * Dedup je nezavistan po kanalu (3 dana): email i push imaju svaki svoj prozor.
 * Vidi vercel.json za raspored.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Kandidati: niske zalihe + aktivan pristup (ne 'inactive').
  const candidates = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      name: profiles.name,
      capsulesRemaining: supply.capsulesRemaining,
      estimatedRunoutDate: supply.estimatedRunoutDate,
    })
    .from(supply)
    .innerJoin(profiles, eq(profiles.id, supply.userId))
    .where(and(lte(supply.capsulesRemaining, LOW_STOCK_THRESHOLD), ne(profiles.accessStatus, 'inactive')))

  let emailsSent = 0
  let pushSent = 0

  if (candidates.length > 0) {
    const ids = candidates.map((c) => c.id)
    const cutoff = new Date(Date.now() - DEDUP_DAYS * 24 * 60 * 60 * 1000)

    // Nezavistan dedup po kanalu — inače bi poslat email blokirao push (i obrnuto).
    const [emailedRecently, pushedRecently] = await Promise.all([
      filterNotifiedSince({ userIds: ids, type: 'low_stock_alert', since: cutoff, channel: 'email' }),
      filterNotifiedSince({ userIds: ids, type: 'low_stock_alert', since: cutoff, channel: 'push' }),
    ])

    for (const c of candidates) {
      if (!emailedRecently.has(c.id)) {
        const res = await sendLowStockEmail(
          { id: c.id, email: c.email, name: c.name },
          { capsulesRemaining: c.capsulesRemaining, estimatedRunoutDate: c.estimatedRunoutDate },
        )
        if (res.ok) emailsSent += 1
      }

      if (!pushedRecently.has(c.id)) {
        const res = await sendPushToUser({
          userId: c.id,
          type: 'low_stock_alert',
          title: `Zalihe su pri kraju — ostalo ${c.capsulesRemaining} kapsula`,
          body: 'Dopuni zalihe da ne prekineš protokol.',
          url: '/zalihe',
          tag: 'low_stock_alert',
        })
        if (res.sent > 0) pushSent += 1
      }
    }
  }

  return NextResponse.json({ processed: candidates.length, emailsSent, pushSent })
}
