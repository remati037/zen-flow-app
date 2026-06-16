import 'server-only'

import { z } from 'zod'

import { type Profile, getCurrentProfile, requireAdmin } from '@/lib/auth'
import { type ActionResult, actionError, actionOk } from './types'

/**
 * Kontekst koji handler dobija nakon uspešne auth provere.
 */
type ActionContext = { profile: Profile }

type Handler<TInput, TOutput> = (input: TInput, ctx: ActionContext) => Promise<TOutput>

type ActionOptions = {
  /** Zahtevaj admin rolu pre izvršavanja (default: false — dovoljan je ulogovan korisnik). */
  admin?: boolean
}

/**
 * Fabrika za type-safe server akcije. Svaka akcija:
 *   1. proveri da je korisnik ulogovan (i admin, ako `admin: true`),
 *   2. validira ulaz kroz zod šemu,
 *   3. izvrši handler sa parsiranim ulazom + kontekstom,
 *   4. uvek vrati tipiziran `ActionResult` (greške se hvataju, ne bacaju ka UI-u).
 *
 * Primer:
 *   export const updateSettings = createAction(updateSettingsSchema, async (data, { profile }) => {
 *     await db.update(profiles).set(...).where(eq(profiles.id, profile.id))
 *   })
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
      console.error('[action] neočekivana greška:', err)
      return actionError('Došlo je do greške. Pokušaj ponovo.')
    }
  }
}
