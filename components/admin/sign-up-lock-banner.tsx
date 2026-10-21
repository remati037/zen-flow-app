import { ShieldAlert } from 'lucide-react'

import { clerkSignUpMode } from '@/lib/admin/signup-diagnostics'
import { EVENTS, logError } from '@/lib/observability/log'

/**
 * Upozorenje kad Clerk instanca NIJE u Restricted sign-up modu.
 *
 * Restricted mod je jedina stvarna brava registracije (vidi `lib/invitations/rules.ts`)
 * i podešava se ručno u Clerk Dashboard-u — lako se zaboravi, posebno na novoj
 * (produkcijskoj) instanci. Ako mod ne može da se pročita, ne prikazuje ništa:
 * lažna uzbuna na svakom otvaranju stranice bi se brzo naučila ignorisati.
 */
export async function SignUpLockBanner() {
  let mode: string
  try {
    mode = await clerkSignUpMode()
  } catch (err) {
    logError(EVENTS.inviteFailed, err, { stage: 'sign_up_mode' })
    return null
  }
  if (mode === 'restricted') return null

  return (
    <div className="flex gap-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-ink ring-1 ring-destructive/30">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div className="space-y-1">
        <p className="font-medium">Registracija nije zaključana (Clerk sign-up mod: {mode})</p>
        <p className="text-slate-mid">
          Bez Restricted moda nalog može da napravi i neko bez pozivnice. Uključi ga u Clerk
          Dashboard → Configure → Restrictions → Sign-up mode: <strong>Restricted</strong>.
          Upozorenje nestaje samo kad se mod promeni.
        </p>
      </div>
    </div>
  )
}
