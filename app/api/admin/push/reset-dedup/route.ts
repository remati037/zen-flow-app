import { and, eq, gte, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getCurrentProfile, requireAdmin } from '@/lib/auth'
import { db, notificationsLog } from '@/lib/db'
import { belgradeDayStart } from '@/lib/dates'

export const runtime = 'nodejs'

/** Tipovi koje dedup blokira po beogradskom danu — jedini koje ova ruta briše. */
const RESETTABLE = ['dose_reminder_morning', 'dose_reminder_evening', 'streak_at_risk'] as const

/**
 * Test alat: obriši današnje uspešne push zapise podsetnika ZA SEBE, da dedup
 * pusti ponovno slanje istog dana.
 *
 * Zašto postoji: dedup je po beogradskom danu i tipu, i promena vremena doze ga
 * NE resetuje (tako i treba — korisnik ne sme da dobije dva podsetnika za istu
 * dozu). Ali to znači da se podešavanje remindera može testirati samo jednom
 * dnevno, što testiranje čini besmisleno sporim.
 *
 * Namerno usko: samo `userId` ulogovanog admina, samo današnji dan, samo push
 * kanal, samo tipovi podsetnika. Ne dira tuđe redove, istoriju ranijih dana,
 * mejlove, ni `low_stock_alert` (koji ima svoj 3-dnevni prozor).
 *
 * Pokretanje (kao ulogovan admin): POST /api/admin/push/reset-dedup
 */
export async function POST() {
  try {
    await requireAdmin()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FORBIDDEN'
    return new NextResponse(msg, { status: msg === 'UNAUTHENTICATED' ? 401 : 403 })
  }

  const profile = await getCurrentProfile()
  if (!profile) return new NextResponse('UNAUTHENTICATED', { status: 401 })

  const deleted = await db
    .delete(notificationsLog)
    .where(
      and(
        eq(notificationsLog.userId, profile.id),
        eq(notificationsLog.channel, 'push'),
        inArray(notificationsLog.type, [...RESETTABLE]),
        gte(notificationsLog.sentAt, belgradeDayStart()),
      ),
    )
    .returning({ id: notificationsLog.id })

  return NextResponse.json({ deleted: deleted.length })
}
