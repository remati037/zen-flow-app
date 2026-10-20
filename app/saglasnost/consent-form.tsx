'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { giveHealthConsent } from '@/app/(app)/podesavanja/account-actions'
import { HealthConsent } from '@/components/legal/health-consent'
import { DeleteAccountButton } from '@/components/settings/delete-account-button'
import { Button } from '@/components/ui/button'

/** Pristanak ili brisanje naloga — treće opcije (korišćenje bez pristanka) nema. */
export function ConsentForm() {
  const router = useRouter()
  const [consent, setConsent] = useState(false)
  const [isPending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      try {
        const result = await giveHealthConsent({ consent: true })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
      } catch {
        toast.error('Nema internet veze. Pokušaj ponovo.')
        return
      }
      router.replace('/dashboard')
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <HealthConsent checked={consent} onCheckedChange={setConsent} />

      <Button
        type="button"
        variant="lime"
        size="lg"
        disabled={!consent || isPending}
        onClick={submit}
      >
        {isPending ? 'Čuvam…' : 'Nastavi'}
      </Button>

      <div className="flex flex-col gap-2 border-t border-foreground/10 pt-4">
        <p className="text-xs text-slate-soft">
          Ako se ne slažeš, možeš da obrišeš nalog i sve podatke iz aplikacije.
        </p>
        <DeleteAccountButton variant="ghost" label="Ne slažem se, obriši nalog" />
      </div>
    </div>
  )
}
