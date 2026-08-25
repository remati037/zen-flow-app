import 'server-only'

import { render } from '@react-email/components'
import { eq } from 'drizzle-orm'
import type { ReactElement } from 'react'

import { db, notificationsLog, profiles } from '@/lib/db'
import { EVENTS, logError, logInfo } from '@/lib/observability/log'
import { claimNotification, settleNotification } from '@/lib/push/dedup'

import { EMAIL_FROM, getResend } from './client'
import { LowStockEmail } from './templates/low-stock'
import { unsubscribeHeaders, unsubscribeUrl } from './unsubscribe'
import { WelcomeEmail } from './templates/welcome'

/**
 * Tipovi mejlova koje gasi `profiles.email_alerts` (V10).
 *
 * Granica je namerna: ALERT je poruka koju šalje raspored (cron), o stanju koje
 * korisnik nije tražio da mu se javi baš sad. `welcome` nije alert — posledica je
 * radnje korisnika (registracija) i ide jednom u životu naloga, pa gašenje alerta
 * ne sme da ga zaustavi. Isto pravilo određuje i ko dobija `List-Unsubscribe`
 * zaglavlje: deklarisati odjavu na mejlu koji se odjavom ne gasi je laž prema
 * mailbox provajderu.
 */
const EMAIL_ALERT_TYPES = new Set<string>(['low_stock_alert'])

/** Da li dati tip podleže opt-out-u (i nosi odjavno zaglavlje). */
export function isEmailAlertType(type: string): boolean {
  return EMAIL_ALERT_TYPES.has(type)
}

type SendEmailArgs = {
  /** Clerk user id — za logovanje u notifications_log. */
  userId: string
  to: string
  subject: string
  react: ReactElement
  /** Tip notifikacije, npr. 'welcome' | 'low_stock_alert'. */
  type: string
  /**
   * Atomarni dedup po beogradskom danu — isti mehanizam kao kod push-a
   * (`lib/push/dedup.ts`), samo na kanalu `email`. Kad je slot već nečiji,
   * mejl se NE šalje i vraća se `skippedDedup: true`.
   */
  dedup?: {
    /** Beogradski kalendarski dan — uvek `belgradeToday()`. */
    day: string
  }
}

type SendResult = {
  ok: boolean
  id?: string
  error?: string
  /** Dedup je potrošio dan za ovaj (korisnik, tip) — slanje nije ni pokušano. */
  skippedDedup?: boolean
  /** Korisnik je ugasio alert mejlove — slanje nije ni pokušano. */
  skippedOptOut?: boolean
}

/**
 * Da li korisnik prima alert mejlove.
 *
 * Provera je OVDE, a ne (samo) u pozivaocu, namerno: `sendEmail` je jedina tačka
 * kroz koju prolazi svaki alert, pa opt-out ne može da procuri zato što je neko
 * dodao novu rutu i zaboravio filter. Cron svejedno pred-filtrira — tamo je to
 * ušteda upita i tačan brojač, ovde je garancija.
 *
 * Fail-OPEN pri grešci upita: nedostupna baza ne sme da zaustavi alert o zalihama.
 * Nepostojeći profil je fail-closed (nema kome ni da se pošalje).
 */
async function acceptsAlertEmails(userId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ emailAlerts: profiles.emailAlerts })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1)
    return row ? row.emailAlerts : false
  } catch (err) {
    logError(EVENTS.emailSendFailed, err, { userId, stage: 'preference_lookup' })
    return true
  }
}

/**
 * Pošalje mejl preko Resend-a i upiše red u `notifications_log`.
 * NIKAD ne baca — hvata grešku, loguje `failed`, vraća `{ ok: false }`.
 * Tako webhook/cron pozivaoci ostaju robustni.
 */
export async function sendEmail({ userId, to, subject, react, type, dedup }: SendEmailArgs): Promise<SendResult> {
  // Opt-out ide PRE rezervacije: odjavljen korisnik ne sme ni da potroši dedup slot
  // (inače bi ponovno uključivanje alerta tog dana i dalje bilo blokirano).
  if (isEmailAlertType(type) && !(await acceptsAlertEmails(userId))) {
    logInfo(EVENTS.emailSkippedOptOut, { userId, type })
    return { ok: false, skippedOptOut: true, error: 'Korisnik je isključio alert mejlove.' }
  }

  // Rezervacija pre renderovanja i slanja: gubitnik trke ne troši ni Resend poziv.
  let claimId: number | null = null
  if (dedup) {
    claimId = await claimNotification({ userId, type, channel: 'email', day: dedup.day })
    if (claimId === null) {
      return { ok: false, skippedDedup: true, error: 'Mejl je za ovaj dan već poslat.' }
    }
  }

  try {
    // Renderujemo HTML + plain-text sami (Resend-ov `react:` prop zahteva zaseban
    // @react-email/render koji nije instaliran). Pass-ujemo gotov html/text.
    const html = await render(react)
    const text = await render(react, { plainText: true })

    const { data, error } = await getResend().emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
      text,
      // Samo alert mejlovi nose odjavu — vidi `EMAIL_ALERT_TYPES`.
      ...(isEmailAlertType(type) ? { headers: unsubscribeHeaders(userId) } : {}),
    })

    if (error) {
      throw new Error(error.message)
    }

    // Sa rezervacijom se zatvara postojeći red; bez nje se upisuje nov.
    if (claimId !== null) await settleNotification(claimId, true)
    else await logNotification(userId, type, 'success')
    return { ok: true, id: data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Mejl adresa NE ide u log (lični podatak); `userId` je dovoljan za korelaciju.
    logError(EVENTS.emailSendFailed, err, { userId, type })
    // Neuspeh OSLOBAĐA dan (`dedup_day = null`) — Resend koji vrati 500 ne sme da
    // ostavi korisnika bez alerta do sutra.
    if (claimId !== null) await settleNotification(claimId, false)
    else await logNotification(userId, type, 'failed')
    return { ok: false, error: message }
  }
}

async function logNotification(userId: string, type: string, status: 'success' | 'failed') {
  try {
    await db.insert(notificationsLog).values({ userId, type, channel: 'email', status })
  } catch (err) {
    // Logovanje ne sme da sruši glavni tok.
    logError(EVENTS.emailSendFailed, err, { userId, type, stage: 'notifications_log' })
  }
}

// ────────────────────────────────────────────────────────────
// Wrapperi po tipu mejla
// ────────────────────────────────────────────────────────────

type ProfileLike = { id: string; email: string; name?: string | null }

/** Opcije koje wrapperi prosleđuju do `sendEmail` (za sada samo dedup). */
type SendOptions = Pick<SendEmailArgs, 'dedup'>

/** Welcome mejl (Clerk user.created). */
export function sendWelcomeEmail(profile: ProfileLike, options: SendOptions = {}): Promise<SendResult> {
  return sendEmail({
    userId: profile.id,
    to: profile.email,
    subject: 'Dobrodošao u NuroLab 🌿',
    react: WelcomeEmail({ name: profile.name }),
    type: 'welcome',
    ...options,
  })
}

type SupplyLike = { capsulesRemaining: number; estimatedRunoutDate?: string | null }

/** Low-stock alert (cron). */
export function sendLowStockEmail(
  profile: ProfileLike,
  supply: SupplyLike,
  options: SendOptions = {},
): Promise<SendResult> {
  return sendEmail({
    userId: profile.id,
    to: profile.email,
    subject: `Zalihe su pri kraju — ostalo ${supply.capsulesRemaining} kapsula`,
    react: LowStockEmail({
      name: profile.name,
      capsulesRemaining: supply.capsulesRemaining,
      runoutDate: supply.estimatedRunoutDate,
      // Vidljiv link u podnožju uz `List-Unsubscribe` zaglavlje: zaglavlje vide
      // samo neki klijenti (Gmail, Apple Mail), a odjava mora da postoji u SVAKOM.
      unsubscribeUrl: unsubscribeUrl(profile.id),
    }),
    type: 'low_stock_alert',
    ...options,
  })
}
