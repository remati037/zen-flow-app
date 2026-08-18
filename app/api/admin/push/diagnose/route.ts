import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getCurrentProfile, requireAdmin } from '@/lib/auth'
import { db, notificationsLog, pushSubscriptions } from '@/lib/db'
import { checkVapidConfig } from '@/lib/push/vapid'

export const runtime = 'nodejs'

const RECENT_LOG_LIMIT = 15

/**
 * Dijagnostika push lanca — jedan poziv koji kaže GDE lanac puca.
 *
 * Postoji jer je "notifikacija ne stiže" nemoguće razlikovati od "nema pretplate"
 * bez pogleda u server logove, a admin je u tom trenutku na telefonu. Vraća
 * stanje VAPID konfiguracije (uklj. proveru da se par ključeva poklapa),
 * pretplate ovog admina i poslednje redove iz `notifications_log`.
 *
 * NE otkriva tajne: pun endpoint pretplate je token, pa se vraća samo host.
 *
 * Pokretanje (kao ulogovan admin): GET /api/admin/push/diagnose
 */
export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FORBIDDEN'
    return new NextResponse(msg, { status: msg === 'UNAUTHENTICATED' ? 401 : 403 })
  }

  const profile = await getCurrentProfile()
  if (!profile) return new NextResponse('UNAUTHENTICATED', { status: 401 })

  const vapid = checkVapidConfig()

  const [subs, recent] = await Promise.all([
    db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, profile.id)),
    db
      .select({
        type: notificationsLog.type,
        channel: notificationsLog.channel,
        status: notificationsLog.status,
        sentAt: notificationsLog.sentAt,
      })
      .from(notificationsLog)
      .where(eq(notificationsLog.userId, profile.id))
      .orderBy(desc(notificationsLog.sentAt))
      .limit(RECENT_LOG_LIMIT),
  ])

  const services = subs.map((s) => {
    try {
      return new URL(s.endpoint).host
    } catch {
      return 'nepoznat servis'
    }
  })

  // Redosled provera prati redosled kojim lanac može da pukne.
  const blockers: string[] = []
  if (vapid.problem) blockers.push(vapid.problem)
  if (subs.length === 0) {
    blockers.push(
      'Nemaš nijednu push pretplatu u bazi. Uključi "Push podsetnike" u Podešavanjima — ' +
        'na iOS-u tek POSLE dodavanja app-a na početni ekran (u Safariju Notification API ne postoji).',
    )
  }
  if (!process.env.CRON_SECRET) {
    blockers.push('CRON_SECRET nije postavljen — sve cron rute vraćaju 401, pa nema podsetnika za doze.')
  }

  const pushFailures = recent.filter((r) => r.channel === 'push' && r.status !== 'success').length

  return NextResponse.json({
    verdict: blockers.length === 0 ? 'ok' : 'blokirano',
    blockers,
    vapid: {
      publicKeySet: vapid.publicKeySet,
      privateKeySet: vapid.privateKeySet,
      publicKeyPrefix: vapid.publicKeyPrefix,
      pairMatches: vapid.pairMatches,
      subject: vapid.subject,
    },
    subscriptions: { count: subs.length, services },
    cronSecretSet: Boolean(process.env.CRON_SECRET),
    /**
     * Dispatcher za podsetnike NE vozi Vercel — vozi ga eksterni scheduler.
     * Ako ovde nema `dose_reminder_*` redova, scheduler najverovatnije nije podešen.
     */
    notificationsDispatcher: {
      note: 'Podsetnike za doze šalje /api/cron/notifications, koji mora da zove EKSTERNI scheduler na 15 min (docs/cron-setup.md). Vercel ga NE pokreće.',
      seenDoseReminders: recent.some((r) => r.type.startsWith('dose_reminder')),
    },
    recentNotifications: recent,
    recentPushFailures: pushFailures,
  })
}
