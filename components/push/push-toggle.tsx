'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Switch } from '@/components/ui/switch'
import { hasActivePushSubscription, isPushSupported, subscribeToPush, unsubscribeFromPush } from '@/lib/push/client'

type PushToggleProps = {
  /** Da li DB već ima pretplatu za ovog korisnika (server-side hint). */
  initialEnabled?: boolean
}

/**
 * Prekidač za push notifikacije. Uključivanje traži dozvolu, pravi pretplatu
 * i perzistira je; isključivanje odjavljuje i briše red. Sinhronizuje se sa
 * stvarnim stanjem browsera na mount-u (initialEnabled je samo početni hint).
 */
export function PushToggle({ initialEnabled = false }: PushToggleProps) {
  const [supported, setSupported] = useState(true)
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    void (async () => {
      if (!isPushSupported()) {
        if (active) setSupported(false)
        return
      }
      // Uskladi UI sa realnim stanjem pretplate u ovom browseru.
      const has = await hasActivePushSubscription()
      if (active) setEnabled(has)
    })()
    return () => {
      active = false
    }
  }, [])

  function handleToggle(next: boolean) {
    startTransition(async () => {
      const result = next ? await subscribeToPush() : await unsubscribeFromPush()
      if (result.ok) {
        setEnabled(next)
        toast(next ? 'Podsetnici uključeni.' : 'Podsetnici isključeni.')
      } else {
        toast(result.error ?? 'Nešto je pošlo naopako.')
      }
    })
  }

  if (!supported) {
    return (
      <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Push notifikacije nisu dostupne</p>
        <p className="mt-1">
          Na iOS-u dodaj aplikaciju na početni ekran (Share → Add to Home Screen) da bi podsetnici radili.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">Push podsetnici</p>
        <p className="text-xs text-muted-foreground">Podsetnici za doze i upozorenja o zalihama.</p>
      </div>
      <Switch checked={enabled} disabled={isPending} onCheckedChange={handleToggle} aria-label="Push podsetnici" />
    </div>
  )
}
