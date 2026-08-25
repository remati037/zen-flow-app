import 'server-only'

import webpush from 'web-push'
import { eq } from 'drizzle-orm'

import { db, notificationsLog, pushSubscriptions } from '@/lib/db'
import { EVENTS, logError, logWarn } from '@/lib/observability/log'
import { claimNotification, settleNotification } from './dedup'
import { PUSH_ENDPOINT_ERROR, isAllowedPushEndpoint } from './endpoint'
import { checkVapidConfig } from './vapid'

/**
 * Socket timeout po jednom slanju.
 *
 * Bez njega `web-push` čeka koliko god push servis hoće — a cron ruta ima tvrd
 * `maxDuration`. Jedan zaglavljen FCM/APNs socket bi pojeo ceo budžet funkcije i
 * korisnici iza njega ne bi dobili ništa, bez ijedne greške u logu (najgori
 * scenario: tihi otkaz podsetnika).
 *
 * 5 s je red veličine iznad normalnog odgovora push servisa (~100–300 ms), pa
 * ne seče zdrave zahteve, a zaglavljen obara odmah — greška ide u `failures` i
 * vidi se u dijagnostici.
 *
 * Iskrena ograda: ovo je timeout NA SOCKET-u, ne na ukupno trajanje odgovora.
 * Servis koji šalje bajt po bajt tehnički može trajati duže. Za realne otkaze
 * (nema odgovora) je tačan, a `runChunked` + `maxDuration` pokrivaju ostatak.
 */
const PUSH_TIMEOUT_MS = 5_000

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
  /**
   * Uključi ATOMARAN dedup po beogradskom danu.
   *
   * Kad je prosleđen, slanje se prvo REZERVIŠE u `notifications_log`
   * (`claimNotification`) — ako je slot za (korisnik, tip, push, dan) već nečiji,
   * ne šalje se ništa i vraća se `skippedDedup: true`. Bez ovog polja ponašanje
   * je staro: pošalji pa uloguj (za ad-hoc slanja, npr. admin test push).
   */
  dedup?: {
    /** Beogradski kalendarski dan — uvek `belgradeToday()`. */
    day: string
  }
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
   * Dedup je već potrošio dan za ovaj (korisnik, tip) — slanje nije ni pokušano.
   * Razlikuje se od `sent: 0` bez pretplate: to je stanje korisnika, ovo je odluka.
   */
  skippedDedup?: boolean
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
export async function sendPushToUser({ userId, type, title, body, url, tag, dedup }: SendPushArgs): Promise<SendPushResult> {
  try {
    ensureConfigured()
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    logError(EVENTS.pushConfigFailed, err, { userId, type })
    await logNotification(userId, type, 'failed')
    return {
      ok: false,
      sent: 0,
      removed: 0,
      failures: [{ service: 'konfiguracija', statusCode: null, reason }],
    }
  }

  // Rezervacija ide PRE svega ostalog: dva preklapajuća run-a dispatchera moraju
  // da se sudare ovde, a ne posle dva već poslata push-a. Gubitnik odlazi bez
  // ijednog odlaznog zahteva.
  let claimId: number | null = null
  if (dedup) {
    claimId = await claimNotification({ userId, type, channel: 'push', day: dedup.day })
    if (claimId === null) {
      return { ok: true, sent: 0, removed: 0, failures: [], skippedDedup: true }
    }
  }

  const allSubs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))

  // Druga linija odbrane za SSRF: zod allowlist štiti SAMO nove upise, a ovo je
  // mesto gde se odlazni zahtev stvarno šalje. Redovi upisani pre allowlist-a
  // (ili ubačeni mimo akcije) ovde ispadaju umesto da nas nateraju na POST ka
  // proizvoljnom hostu. Ne brišemo ih automatski — brisanje na osnovu politike
  // koja se može promeniti bi tiho pojelo validne pretplate.
  const subs = allSubs.filter((s) => isAllowedPushEndpoint(s.endpoint))
  const blocked = allSubs.length - subs.length
  if (blocked > 0) {
    // Pun endpoint NIKAD ne ide u log — sadrži tajni token pretplate.
    logWarn(EVENTS.pushEndpointBlocked, { userId, type, blocked })
  }

  if (subs.length === 0) {
    // Rezervacija se OSLOBAĐA: ništa nije poslato, pa dan ne sme da bude potrošen —
    // korisnik koji uključi push u 09:00 mora da dobije podsetnik u 09:15.
    if (claimId !== null) await settleNotification(claimId, false)
    // `ok: false` samo kad je odbijanje razlog za prazan skup — "korisnik nema
    // pretplatu" i "sve pretplate su blokirane" nisu isti ishod za dijagnostiku.
    return blocked > 0
      ? {
          ok: false,
          sent: 0,
          removed: 0,
          failures: [{ service: 'allowlist', statusCode: null, reason: PUSH_ENDPOINT_ERROR }],
        }
      : { ok: true, sent: 0, removed: 0, failures: [] }
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
        { timeout: PUSH_TIMEOUT_MS },
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
      logError(EVENTS.pushSendFailed, err, { userId, type, service, statusCode, removed: statusCode === 404 || statusCode === 410 })
    }
  }

  // Sa rezervacijom se red ZATVARA (pending → success/failed); bez nje se upisuje
  // nov. Dva puta ne sme — inače bi `notifications_log` imao duplikat po slanju.
  if (claimId !== null) await settleNotification(claimId, sent > 0)
  else await logNotification(userId, type, sent > 0 ? 'success' : 'failed')

  return { ok: sent > 0, sent, removed, failures }
}

async function logNotification(userId: string, type: string, status: 'success' | 'failed') {
  try {
    await db.insert(notificationsLog).values({ userId, type, channel: 'push', status })
  } catch (err) {
    // Logovanje ne sme da sruši glavni tok.
    logError(EVENTS.pushSendFailed, err, { userId, type, stage: 'notifications_log' })
  }
}
