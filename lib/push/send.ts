import 'server-only'

import webpush from 'web-push'
import { eq } from 'drizzle-orm'

import { db, notificationsLog, pushSubscriptions } from '@/lib/db'

let _configured = false

/**
 * Lazy VAPID setup — konfiguriše `web-push` tek pri prvom slanju.
 * Tako import modula (npr. tokom `next build`) ne puca ako ključevi još nisu postavljeni;
 * greška se javlja samo kad se push stvarno šalje.
 */
function ensureConfigured() {
  if (_configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:podrska@nurolab.rs'
  if (!publicKey || !privateKey) {
    throw new Error('VAPID ključevi nisu postavljeni. Dodaj NEXT_PUBLIC_VAPID_PUBLIC_KEY i VAPID_PRIVATE_KEY u .env.local')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  _configured = true
}

type SendPushArgs = {
  /** Clerk user id — kome šaljemo i za logovanje u notifications_log. */
  userId: string
  /** Tip notifikacije, npr. 'test' | 'dose_reminder_morning' | 'low_stock_alert'. */
  type: string
  title: string
  body: string
  /** Ruta koju otvara klik na notifikaciju (default '/dashboard' u SW-u). */
  url?: string
  /** Tag protiv dupliranja notifikacija istog tipa. */
  tag?: string
}

type SendPushResult = { ok: boolean; sent: number; removed: number }

/**
 * Pošalje push na SVE pretplate korisnika i upiše red u `notifications_log`.
 * NIKAD ne baca — hvata greške, čisti stale pretplate (404/410), loguje status.
 * Tako webhook/cron pozivaoci ostaju robustni.
 */
export async function sendPushToUser({ userId, type, title, body, url, tag }: SendPushArgs): Promise<SendPushResult> {
  try {
    ensureConfigured()
  } catch (err) {
    console.error(`[push] konfiguracija neuspešna za "${type}":`, err instanceof Error ? err.message : err)
    await logNotification(userId, type, 'failed')
    return { ok: false, sent: 0, removed: 0 }
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))

  if (subs.length === 0) {
    return { ok: true, sent: 0, removed: 0 }
  }

  const payload = JSON.stringify({ title, body, url: url ?? '/dashboard', tag })

  let sent = 0
  let removed = 0

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      sent += 1
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode
      // 404/410 → endpoint više ne postoji; obriši stale pretplatu.
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint))
        removed += 1
      } else {
        console.error(`[push] slanje "${type}" na ${sub.endpoint} neuspešno (${statusCode ?? '?'}):`, err instanceof Error ? err.message : err)
      }
    }
  }

  await logNotification(userId, type, sent > 0 ? 'success' : 'failed')
  return { ok: sent > 0, sent, removed }
}

async function logNotification(userId: string, type: string, status: 'success' | 'failed') {
  try {
    await db.insert(notificationsLog).values({ userId, type, channel: 'push', status })
  } catch (err) {
    // Logovanje ne sme da sruši glavni tok.
    console.error('[push] upis u notifications_log neuspešan:', err)
  }
}
