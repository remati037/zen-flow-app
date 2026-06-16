import 'server-only'

import { render } from '@react-email/components'
import type { ReactElement } from 'react'

import { db, notificationsLog } from '@/lib/db'

import { EMAIL_FROM, getResend } from './client'
import { LowStockEmail } from './templates/low-stock'
import { WelcomeEmail } from './templates/welcome'

type SendEmailArgs = {
  /** Clerk user id — za logovanje u notifications_log. */
  userId: string
  to: string
  subject: string
  react: ReactElement
  /** Tip notifikacije, npr. 'welcome' | 'low_stock_alert'. */
  type: string
}

type SendResult = { ok: boolean; id?: string; error?: string }

/**
 * Pošalje mejl preko Resend-a i upiše red u `notifications_log`.
 * NIKAD ne baca — hvata grešku, loguje `failed`, vraća `{ ok: false }`.
 * Tako webhook/cron pozivaoci ostaju robustni.
 */
export async function sendEmail({ userId, to, subject, react, type }: SendEmailArgs): Promise<SendResult> {
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
    })

    if (error) {
      throw new Error(error.message)
    }

    await logNotification(userId, type, 'success')
    return { ok: true, id: data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[email] slanje "${type}" na ${to} neuspešno:`, message)
    await logNotification(userId, type, 'failed')
    return { ok: false, error: message }
  }
}

async function logNotification(userId: string, type: string, status: 'success' | 'failed') {
  try {
    await db.insert(notificationsLog).values({ userId, type, channel: 'email', status })
  } catch (err) {
    // Logovanje ne sme da sruši glavni tok.
    console.error('[email] upis u notifications_log neuspešan:', err)
  }
}

// ────────────────────────────────────────────────────────────
// Wrapperi po tipu mejla
// ────────────────────────────────────────────────────────────

type ProfileLike = { id: string; email: string; name?: string | null }

/** Welcome mejl (Clerk user.created). */
export function sendWelcomeEmail(profile: ProfileLike): Promise<SendResult> {
  return sendEmail({
    userId: profile.id,
    to: profile.email,
    subject: 'Dobrodošao u NuroLab 🌿',
    react: WelcomeEmail({ name: profile.name }),
    type: 'welcome',
  })
}

type SupplyLike = { capsulesRemaining: number; estimatedRunoutDate?: string | null }

/** Low-stock alert (cron). */
export function sendLowStockEmail(profile: ProfileLike, supply: SupplyLike): Promise<SendResult> {
  return sendEmail({
    userId: profile.id,
    to: profile.email,
    subject: `Zalihe su pri kraju — ostalo ${supply.capsulesRemaining} kapsula`,
    react: LowStockEmail({
      name: profile.name,
      capsulesRemaining: supply.capsulesRemaining,
      runoutDate: supply.estimatedRunoutDate,
    }),
    type: 'low_stock_alert',
  })
}
