import 'server-only'

import webpush from 'web-push'
import { eq } from 'drizzle-orm'

import { db, notificationsLog, pushSubscriptions } from '@/lib/db'
import { checkVapidConfig } from './vapid'

let _configured = false

/**
 * Lazy VAPID setup — konfiguriše `web-push` tek pri prvom slanju.
 * Tako import modula (npr. tokom `next build`) ne puca ako ključevi još nisu postavljeni;
 * greška se javlja samo kad se push stvarno šalje.
 */
function ensureConfigured() {
  if (_configured) return
  // Provera para hvata najtiši otkaz: nepoklapanje javnog i privatnog ključa
  // daje 403 na SVAKO slanje, bez ijedne greške u kodu. Bolje pući ovde, sa
  // jasnom porukom, nego slati u prazno.
  const vapid = checkVapidConfig()
  if (vapid.problem) {
    throw new Error(vapid.problem)
  }
  webpush.setVapidDetails(
    vapid.subject,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
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

/** Detalj neuspelog slanja — bez punog endpoint-a (sadrži tajni token pretplate). */
export type PushFailure = {
  /** Host push servisa, npr. 'fcm.googleapis.com' ili 'web.push.apple.com'. */
  service: string
  statusCode: number | null
  reason: string
}

type SendPushResult = {
  ok: boolean
  sent: number
  removed: number
  /**
   * Zašto slanje nije uspelo. Ranije je završavalo samo u `console.error`, pa je
   * pozivalac video `sent: 0` i pogrešno zaključivao "nema pretplate".
   */
  failures: PushFailure[]
}

/** Host iz endpoint-a — bezbedno za prikaz (pun endpoint je tajna). */
function serviceOf(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return 'nepoznat servis'
  }
}

/** Prevod čestih HTTP statusa push servisa u uputstvo šta da se radi. */
function explainStatus(statusCode: number | null, message: string): string {
  switch (statusCode) {
    case 400:
      return 'Neispravan zahtev — najčešće loš VAPID subject ili oštećeni ključevi pretplate.'
    case 401:
    case 403:
      return 'Push servis je odbio VAPID potpis (403). Javni ključ kojim je napravljena pretplata ne odgovara privatnom ključu na serveru — postavi oba iz istog para i uradi redeploy.'
    case 404:
    case 410:
      return 'Pretplata više ne postoji (uređaj je odjavljen ili je app obrisan) — red je uklonjen.'
    case 413:
      return 'Payload je prevelik za push servis.'
    case 429:
      return 'Push servis privremeno odbija zahteve (rate limit).'
    default:
      return message || 'Nepoznata greška push servisa.'
  }
}

/**
 * Pošalje push na SVE pretplate korisnika i upiše red u `notifications_log`.
 * NIKAD ne baca — hvata greške, čisti stale pretplate (404/410), loguje status.
 * Tako webhook/cron pozivaoci ostaju robustni.
 */
export async function sendPushToUser({ userId, type, title, body, url, tag }: SendPushArgs): Promise<SendPushResult> {
  try {
    ensureConfigured()
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[push] konfiguracija neuspešna za "${type}":`, reason)
    await logNotification(userId, type, 'failed')
    return {
      ok: false,
      sent: 0,
      removed: 0,
      failures: [{ service: 'konfiguracija', statusCode: null, reason }],
    }
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))

  if (subs.length === 0) {
    return { ok: true, sent: 0, removed: 0, failures: [] }
  }

  const payload = JSON.stringify({ title, body, url: url ?? '/dashboard', tag })

  let sent = 0
  let removed = 0
  const failures: PushFailure[] = []

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      sent += 1
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode ?? null
      const message = err instanceof Error ? err.message : String(err)
      const service = serviceOf(sub.endpoint)

      // 404/410 → endpoint više ne postoji; obriši stale pretplatu.
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint))
        removed += 1
      }

      failures.push({ service, statusCode, reason: explainStatus(statusCode, message) })
      console.error(`[push] slanje "${type}" na ${service} neuspešno (${statusCode ?? '?'}):`, message)
    }
  }

  await logNotification(userId, type, sent > 0 ? 'success' : 'failed')
  return { ok: sent > 0, sent, removed, failures }
}

async function logNotification(userId: string, type: string, status: 'success' | 'failed') {
  try {
    await db.insert(notificationsLog).values({ userId, type, channel: 'push', status })
  } catch (err) {
    // Logovanje ne sme da sruši glavni tok.
    console.error('[push] upis u notifications_log neuspešan:', err)
  }
}
