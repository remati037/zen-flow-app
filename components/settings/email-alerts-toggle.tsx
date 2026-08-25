'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { updateSettings } from '@/app/(app)/podesavanja/actions'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

/**
 * Prekidač za alert mejlove (V10).
 *
 * Gasi `profiles.email_alerts` — istu kolonu koju obara i `List-Unsubscribe` iz
 * mejla, pa su dva ulaza uvek u istom stanju. Namerno NE dira push: korisnik
 * koji ne želi mejl često i dalje želi podsetnik na telefonu, a jedan prekidač
 * za oba bi ga naterao da bira sve ili ništa.
 */
export function EmailAlertsToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()

  function handleToggle(next: boolean) {
    // Optimističan prikaz; vraća se na staro ako server odbije.
    setEnabled(next)
    startTransition(async () => {
      const result = await updateSettings({ emailAlerts: next })
      if (result.ok) {
        toast.success(next ? 'Alert mejlovi uključeni.' : 'Alert mejlovi isključeni.')
        router.refresh()
      } else {
        setEnabled(!next)
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor="email-alerts">Alert mejlovi</Label>
        <p className="text-xs text-slate-soft">
          Mejl kad ti zalihe padnu pri kraj. Najviše 3 po epizodi — brojač se resetuje kad dopuniš
          zalihe. Ne utiče na push podsetnike.
        </p>
      </div>
      <Switch
        id="email-alerts"
        checked={enabled}
        disabled={isPending}
        onCheckedChange={handleToggle}
      />
    </div>
  )
}
