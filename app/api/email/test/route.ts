import { NextResponse, type NextRequest } from 'next/server'

import { getCurrentProfile, isAdmin } from '@/lib/auth'
import { sendLowStockEmail, sendWelcomeEmail } from '@/lib/email/send'

export const runtime = 'nodejs'

/**
 * Admin-only test ruta — pošalje probni mejl na email ulogovanog admina.
 * Koristi se za proveru da RESEND_API_KEY + EMAIL_FROM rade pre webhook/cron.
 *
 * Primer: GET /api/email/test?type=welcome  (ili ?type=low_stock)
 */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const profile = await getCurrentProfile()
  if (!profile) {
    return new NextResponse('No profile', { status: 404 })
  }

  const type = req.nextUrl.searchParams.get('type') ?? 'welcome'

  const result =
    type === 'low_stock'
      ? await sendLowStockEmail(profile, {
          capsulesRemaining: 8,
          estimatedRunoutDate: '2026-06-22',
        })
      : await sendWelcomeEmail(profile)

  const status = result.ok ? 200 : 502
  return NextResponse.json({ type, to: profile.email, ...result }, { status })
}
