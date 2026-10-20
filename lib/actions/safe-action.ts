import 'server-only'

import { z } from 'zod'

import { ACCESS_INACTIVE_MESSAGE, requireActiveAccess } from '@/lib/access/status'
import { type Profile, getCurrentProfile, requireAdmin } from '@/lib/auth'
import { EVENTS, logError } from '@/lib/observability/log'
import { ActionError, type ActionResult, actionError, actionOk } from './types'

/**
 * Kontekst koji handler dobija nakon uspešne auth provere.
 */
type ActionContext = { profile: Profile }

/** Poruka akcije koju je pozvao korisnik bez pristanka (vidi `allowWithoutConsent`). */
export const CONSENT_REQUIRED_MESSAGE = 'Pre nastavka potvrdi saglasnost za obradu podataka.'

type Handler<TInput, TOutput> = (input: TInput, ctx: ActionContext) => Promise<TOutput>

type ActionOptions = {
  /**
   * Zahtevaj admin rolu pre izvršavanja (default: false — dovoljan je ulogovan korisnik).
   * Admin akcije preskaču gejt pristupa: rola je izvor istine, a `resolveAccessStatus`
   * ionako svakog admina svodi na `vip`.
   */
  admin?: boolean
  /**
   * EKSPLICITAN opt-out iz gejta pristupa — akcija sme i korisniku sa `access_status`
   * `inactive`. Default je `false`: svaka akcija je gejtovana dok se ovde ne kaže drugačije,
   * pa nova akcija ne može da procuri kroz paywall zato što je neko zaboravio da doda proveru.
   *
   * Koristi ga samo `deleteAccount`: pravo na brisanje ne zavisi od kupovine. Kandidati
   * za Fazu 2: Stripe checkout / reaktivacija, tj. akcije koje neaktivan korisnik mora da
   * pozove da BI ponovo dobio pristup. Vidi i komentar uz `completeOnboarding`.
   */
  allowInactive?: boolean
  /**
   * EKSPLICITAN opt-out iz gejta pristanka za podatke o zdravlju. Default je `false`:
   * onboardovan korisnik bez `health_consent_at` ne upisuje ništa dok ne potvrdi na
   * `/saglasnost`. Izuzete su samo akcije koje služe davanju ili povlačenju pristanka
   * (`giveHealthConsent`, `deleteAccount`). Neonboardovan korisnik daje pristanak kroz
   * `completeOnboarding`, pa ga gejt ne dira.
   */
  allowWithoutConsent?: boolean
}

/**
 * Fabrika za type-safe server akcije. Svaka akcija:
 *   1. proveri da je korisnik ulogovan (i admin, ako `admin: true`),
 *   2. proveri da mu je pristup i dalje aktivan (osim uz `allowInactive: true` ili `admin: true`)
 *      i da je dao pristanak za podatke o zdravlju (osim uz `allowWithoutConsent: true`),
 *   3. validira ulaz kroz zod šemu,
 *   4. izvrši handler sa parsiranim ulazom + kontekstom,
 *   5. uvek vrati tipiziran `ActionResult` (greške se hvataju, ne bacaju ka UI-u).
 *
 * Primer:
 *   export const updateSettings = createAction(updateSettingsSchema, async (data, { profile }) => {
 *     await db.update(profiles).set(...).where(eq(profiles.id, profile.id))
 *   })
 *
 * Za grešku čiju poruku treba pokazati korisniku baci `ActionError` — sve ostalo se
 * loguje i vraća kao generična poruka.
 */
export function createAction<TSchema extends z.ZodType, TOutput>(
  schema: TSchema,
  handler: Handler<z.infer<TSchema>, TOutput>,
  options: ActionOptions = {},
) {
  return async (input: unknown): Promise<ActionResult<TOutput>> => {
    // 1. Auth
    const profile = await getCurrentProfile()
    if (!profile) {
      return actionError('Sesija je istekla. Prijavi se ponovo.')
    }
    if (options.admin) {
      try {
        await requireAdmin()
      } catch {
        return actionError('Nemaš dozvolu za ovu akciju.')
      }
    } else if (!options.allowInactive) {
      // 1b. Gejt pristupa (S-M2). Redirect u `(app)/layout.tsx` štiti samo render stranice;
      // server akcija je zaseban POST endpoint i bez ove provere je bila otvorena
      // neaktivnom korisniku. Vraćamo poruku, ne bacamo — UI je prikazuje kao toast.
      const { allowed } = await requireActiveAccess(profile)
      if (!allowed) {
        return actionError(ACCESS_INACTIVE_MESSAGE)
      }
    }
    // 1c. Gejt pristanka — isti razlog kao 1b: stranice preusmeravaju na `/saglasnost`,
    // ali server akcija je zaseban endpoint.
    if (
      !options.admin &&
      !options.allowWithoutConsent &&
      profile.onboardingCompleted &&
      !profile.healthConsentAt
    ) {
      return actionError(CONSENT_REQUIRED_MESSAGE)
    }

    // 2. Validacija ulaza
    const parsed = schema.safeParse(input)
    if (!parsed.success) {
      const { fieldErrors } = z.flattenError(parsed.error)
      return actionError('Neispravni podaci.', fieldErrors as Record<string, string[]>)
    }

    // 3. Izvršavanje
    try {
      const data = await handler(parsed.data, { profile })
      return actionOk(data)
    } catch (err) {
      // Namerno bačena, korisniku razumljiva greška (npr. prekoračen backfill prozor).
      if (err instanceof ActionError) {
        return actionError(err.message, err.fieldErrors)
      }
      // Neuhvaćena greška u server akciji — jedina tačka gde se sve one skupljaju.
      // Strukturno, sa `userId`-em, da se u logu može odvojiti „jedan korisnik ima
      // pokvaren profil" od „akcija je pukla svima".
      logError(EVENTS.actionFailed, err, { userId: profile.id })
      return actionError('Nešto nije u redu. Pokušaj ponovo.')
    }
  }
}
