import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { NextResponse, type NextRequest } from 'next/server'

import { ActionError } from '@/lib/actions/types'
import { refreshAccessStatusForProfile } from '@/lib/access/status'
import { addDaysIso, belgradeToday } from '@/lib/dates'
import { db, profiles } from '@/lib/db'
import { EVENTS, logError } from '@/lib/observability/log'
import { verifyCheckinToken } from '@/lib/push/checkin-token'
import { recordDose } from '@/lib/protocol/record-dose'
import { pushCheckinSchema } from '@/lib/validations/protocol'

export const runtime = 'nodejs'

/**
 * Check-in iz notifikacije — dugme „Uzeto" na podsetniku za dozu.
 *
 * Javna ruta (`PUBLIC_ROUTES`): zove je service worker iz `notificationclick`,
 * često bez otvorenog prozora, pa Clerk sesije nema. Autentikacija je HMAC token
 * (`lib/push/checkin-token.ts`) vezan za korisnika, dan i dozu — korisnik se
 * izvodi iz tokena, nikad iz sesije ili slobodnog unosa.
 *
 * Pravila:
 *  - samo DANAS i JUČE (podsetnik od sinoć kliknut posle ponoći je i dalje
 *    legitiman; stariji token ne upisuje ništa) — rok važenja nosi sam dan;
 *  - isti gejt pristupa kao app (`inactive` → 403) i završen onboarding;
 *  - upis ide kroz `recordDose` — ISTA izjava kao check-in u app-u, pa je
 *    ponovljen klik prirodno no-op (delta 0).
 */
export async function POST(req: NextRequest) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Neispravan zahtev.' }, { status: 400 })
  }
  const parsed = pushCheckinSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Neispravan zahtev.' }, { status: 400 })
  }
  const { userId, date, dose, token } = parsed.data

  if (!verifyCheckinToken(userId, date, dose, token)) {
    return NextResponse.json({ error: 'Neispravan token.' }, { status: 401 })
  }

  const today = belgradeToday()
  if (date !== today && date !== addDaysIso(today, -1)) {
    return NextResponse.json({ error: 'Podsetnik je istekao — označi dozu u aplikaciji.' }, { status: 410 })
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1)
  if (!profile || !profile.onboardingCompleted) {
    return NextResponse.json({ error: 'Nalog nije spreman.' }, { status: 404 })
  }

  // Rola iz baze (nema Clerk claim-a bez sesije) — admin u bazi je i dalje `vip`.
  const status = await refreshAccessStatusForProfile(profile)
  if (status === 'inactive') {
    return NextResponse.json({ error: 'Pristup je istekao.' }, { status: 403 })
  }

  try {
    const result = await recordDose(profile, { date, dose, status: 'taken' })
    revalidatePath('/dashboard')
    revalidatePath('/protokol')
    revalidatePath('/zalihe')
    return NextResponse.json({
      ok: true,
      streak: result.streak.current,
      todayComplete: result.streak.todayComplete,
      capsulesRemaining: result.capsulesRemaining,
    })
  } catch (err) {
    if (err instanceof ActionError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    logError(EVENTS.actionFailed, err, { userId, stage: 'push_checkin' })
    return NextResponse.json({ error: 'Check-in nije uspeo.' }, { status: 500 })
  }
}
