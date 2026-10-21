'use server'

import { sql } from 'drizzle-orm'
import { after } from 'next/server'

import { isKnownBuyer } from '@/lib/access/status'
import { createPublicAction } from '@/lib/actions/safe-action'
import { db, profiles } from '@/lib/db'
import { issueInvitation } from '@/lib/invitations/issue'
import { SIGN_UP_REQUEST_MESSAGE } from '@/lib/invitations/rules'
import { EVENTS, logError, logInfo } from '@/lib/observability/log'
import { signUpRequestSchema } from '@/lib/validations/invitations'

/**
 * Kupac bez naloga traži link za registraciju (Clerk je u Restricted modu, pa
 * je pozivnica jedini put do naloga).
 *
 * Javna akcija — dve stvari su zato namerne:
 *  1. Odgovor je UVEK isti (`SIGN_UP_REQUEST_MESSAGE`), za kupca, ne-kupca i
 *     postojeći nalog. Inače bi forma odgovarala na pitanje „da li je X kupio".
 *  2. SAV posao (upit nad `orders`, Clerk, Resend) ide u `after()`, posle
 *     odgovora. Da se radi pre, kupac bi čekao ~1 s (Clerk + Resend), a ne-kupac
 *     ~50 ms — vreme odgovora bi otkrivalo isto što i tekst.
 *
 * Zaštita od zatrpavanja tuđeg inboxa: `BUYER_INVITE_COOLDOWN_MIN` u
 * `issueInvitation` (jedan link na 10 min po mejlu).
 */
export const requestSignUpLink = createPublicAction(signUpRequestSchema, async ({ email }) => {
  after(async () => {
    try {
      const [existing] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(sql`lower(${profiles.email}) = ${email}`)
        .limit(1)
      if (existing) {
        logInfo(EVENTS.inviteSkipped, { reason: 'account_exists', userId: existing.id })
        return
      }

      if (!(await isKnownBuyer(email))) {
        logInfo(EVENTS.inviteSkipped, { reason: 'not_a_buyer' })
        return
      }

      await issueInvitation({ email, kind: 'buyer', by: null })
    } catch (err) {
      logError(EVENTS.inviteFailed, err, { kind: 'buyer' })
    }
  })

  return { message: SIGN_UP_REQUEST_MESSAGE }
})
