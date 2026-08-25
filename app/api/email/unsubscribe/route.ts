import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { db, profiles } from '@/lib/db'
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe'
import { EVENTS, logInfo } from '@/lib/observability/log'

export const runtime = 'nodejs'

/**
 * Odjava sa alert mejlova preko potpisanog linka iz samog mejla (V10).
 *
 * JAVNA ruta (`PUBLIC_ROUTES`) — i to je suština, ne propust: zovu je mejl klijent
 * i mailbox provider, nijedan od njih nema Clerk sesiju. Autentikacija je HMAC
 * token vezan za `userId` (`lib/email/unsubscribe.ts`), ne sesija. Bez ovoga bi
 * `auth.protect()` presreo zahtev i za ne-HTML POST vratio 404, pa bi Gmail-ova
 * one-click odjava tiho otkazivala — a odjava koja ne radi se zameni dugmetom
 * „Spam", što košta reputaciju domena.
 *
 * `POST` je RFC 8058 one-click put (obećan kroz `List-Unsubscribe-Post`) i mora
 * da odjavi BEZ ijednog dodatnog koraka — bez potvrde, bez logina.
 * `GET` je ljudski put (klik na link u podnožju): odjavi pa vodi na potvrdu.
 *
 * Radnja je idempotentna: ponovljen POST na već odjavljen nalog je opet 200.
 */

type Outcome = { ok: true; alreadyOff: boolean } | { ok: false }

async function unsubscribe(req: NextRequest): Promise<Outcome> {
  const userId = req.nextUrl.searchParams.get('u')
  const token = req.nextUrl.searchParams.get('t')
  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return { ok: false }
  }

  // `where email_alerts` u uslovu: red se vraća samo pri STVARNOJ promeni, pa se
  // ponovljena odjava razlikuje od prve bez dodatnog čitanja (isti obrazac kao
  // check-in u `app/(app)/protokol/actions.ts`).
  const changed = await db
    .update(profiles)
    .set({ emailAlerts: false })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id, emailAlerts: profiles.emailAlerts })

  if (changed.length === 0) {
    // Validan potpis za nepostojeći profil (obrisan nalog) — nema šta da se gasi,
    // ali odjavu prijavljujemo kao uspelu: provajder ne sme da dobije grešku.
    return { ok: true, alreadyOff: true }
  }

  logInfo(EVENTS.emailUnsubscribed, { userId, channel: 'email' })
  return { ok: true, alreadyOff: false }
}

/** One-click odjava (Gmail/Yahoo). Telo odgovora niko ne čita — bitan je status. */
export async function POST(req: NextRequest) {
  const result = await unsubscribe(req)
  return result.ok
    ? new NextResponse('OK', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    : new NextResponse('Neispravan ili istekao odjavni link.', { status: 400 })
}

/** Klik iz mejla — posle odjave vodi na stranicu sa potvrdom i povratkom nazad. */
export async function GET(req: NextRequest) {
  const result = await unsubscribe(req)
  const target = new URL(result.ok ? '/odjava-mejlova' : '/odjava-mejlova?greska=1', req.nextUrl.origin)
  // 303: klik je GET, ali je iza njega izmena stanja — redirect mora da vodi na
  // stranicu koja se sme osvežiti bez ponovne radnje.
  return NextResponse.redirect(target, 303)
}
