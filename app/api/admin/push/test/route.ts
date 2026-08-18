import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getCurrentProfile, requireAdmin } from '@/lib/auth'
import { db, pushSubscriptions } from '@/lib/db'
import { sendPushToUser } from '@/lib/push/send'

export const runtime = 'nodejs'

/**
 * Admin test push — pošalje probnu notifikaciju na SOPSTVENE pretplate admina.
 * Brza provera end-to-end lanca (subscribe → VAPID → SW → prikaz).
 *
 * Pokretanje (kao ulogovan admin): POST /api/admin/push/test
 */
export async function POST() {
  try {
    await requireAdmin()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FORBIDDEN'
    return new NextResponse(msg, { status: msg === 'UNAUTHENTICATED' ? 401 : 403 })
  }

  const profile = await getCurrentProfile()
  if (!profile) {
    return new NextResponse('UNAUTHENTICATED', { status: 401 })
  }

  // Broj pretplata se vraća da UI razlikuje "nema pretplate" od "pretplata
  // postoji ali je slanje odbijeno" — ranije je oboje izgledalo isto (sent: 0).
  const subs = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, profile.id))

  const result = await sendPushToUser({
    userId: profile.id,
    type: 'test',
    title: 'Test notifikacija 🌿',
    body: 'Push radi! Ovako će izgledati podsetnici.',
    url: '/dashboard',
    tag: 'test',
  })

  return NextResponse.json({ ...result, subscriptions: subs.length })
}
