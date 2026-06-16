import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { db, notificationsLog, profiles, supply } from '@/lib/db'
import { sendLowStockEmail } from '@/lib/email/send'

export const runtime = 'nodejs'

/** Prag ispod kog se šalje alert: 14 kapsula ≈ nedelja dana na 2 doze dnevno. */
const LOW_STOCK_THRESHOLD = 14
/** Ne šalji ponovo low-stock mejl ako je već poslat u zadnjih ovoliko dana. */
const DEDUP_DAYS = 3

/**
 * Vercel Cron — pronalazi korisnike sa niskim zalihama i šalje email alert.
 * Zaštićen `CRON_SECRET`-om (Vercel Cron šalje `Authorization: Bearer <secret>`).
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

  let sent = 0

  if (candidates.length > 0) {
    // Dedup: ko je već dobio low_stock_alert u zadnjih DEDUP_DAYS dana.
    const cutoff = new Date(Date.now() - DEDUP_DAYS * 24 * 60 * 60 * 1000)
    const recent = await db
      .select({ userId: notificationsLog.userId })
      .from(notificationsLog)
      .where(
        and(
          inArray(
            notificationsLog.userId,
            candidates.map((c) => c.id),
          ),
          eq(notificationsLog.type, 'low_stock_alert'),
          eq(notificationsLog.status, 'success'),
          gte(notificationsLog.sentAt, cutoff),
        ),
      )
    const alreadyNotified = new Set(recent.map((r) => r.userId))

    for (const c of candidates) {
      if (alreadyNotified.has(c.id)) continue
      const res = await sendLowStockEmail(
        { id: c.id, email: c.email, name: c.name },
        { capsulesRemaining: c.capsulesRemaining, estimatedRunoutDate: c.estimatedRunoutDate },
      )
      if (res.ok) sent += 1
    }
  }

  return NextResponse.json({ processed: candidates.length, sent })
}
