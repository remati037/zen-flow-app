import 'server-only'

import { z } from 'zod'

import { ACCESS_INACTIVE_MESSAGE, requireActiveAccess } from '@/lib/access/status'
import { type Profile, getCurrentProfile, requireAdmin } from '@/lib/auth'
import { ActionError, type ActionResult, actionError, actionOk } from './types'

/**
 * Kontekst koji handler dobija nakon uspešne auth provere.
 */
type ActionContext = { profile: Profile }

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
   * Trenutno NIJEDNA akcija ovo ne koristi — vidi komentar uz `completeOnboarding`.
   * Kandidati za Fazu 2: Stripe checkout / reaktivacija, tj. akcije koje neaktivan
   * korisnik mora da pozove da BI ponovo dobio pristup.
   */
  allowInactive?: boolean
}

/**
 * Fabrika za type-safe server akcije. Svaka akcija:
 *   1. proveri da je korisnik ulogovan (i admin, ako `admin: true`),
 *   2. proveri da mu je pristup i dalje aktivan (osim uz `allowInactive: true` ili `admin: true`),
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
      return actionError('Niste prijavljeni.')
    }
    if (options.admin) {
      try {
        await requireAdmin()
      } catch {
        return actionError('Nemate dozvolu za ovu akciju.')
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
      console.error('[action] neočekivana greška:', err)
      return actionError('Došlo je do greške. Pokušaj ponovo.')
    }
  }
}
