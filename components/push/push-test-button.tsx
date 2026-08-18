'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

/**
 * Admin dugme — pošalje test push na sopstvene pretplate preko /api/admin/push/test.
 * Praktično za testiranje na telefonu (bez DevTools konzole).
 */
export function PushTestButton() {
  const [loading, setLoading] = useState(false)

  async function sendTest() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/push/test', { method: 'POST' })
      if (!res.ok) {
        toast(res.status === 403 ? 'Nemaš admin dozvolu.' : `Greška ${res.status}.`)
        return
      }
      const data = (await res.json()) as {
        ok: boolean
        sent: number
        removed: number
        subscriptions: number
        failures: { service: string; statusCode: number | null; reason: string }[]
      }

      if (data.sent > 0) {
        toast.success(`Test push poslat na ${data.sent} uređaj(a). 🌿`)
        return
      }

      // Bez ovog grananja svaki neuspeh je izgledao kao "nema pretplate",
      // pa je pravi uzrok (npr. 403 zbog VAPID nepoklapanja) ostajao skriven.
      if (data.subscriptions === 0) {
        toast('Nemaš aktivnu pretplatu — uključi push podsetnike u Podešavanjima.')
        return
      }

      const first = data.failures[0]
      toast.error(
        first
          ? `Slanje odbijeno${first.statusCode ? ` (${first.statusCode})` : ''}: ${first.reason}`
          : 'Slanje nije uspelo iz nepoznatog razloga — vidi dijagnostiku.',
        { duration: 12_000 },
      )
    } catch {
      toast('Slanje nije uspelo. Pokušaj ponovo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={sendTest} disabled={loading} variant="outline">
      {loading ? 'Šaljem…' : 'Pošalji test push'}
    </Button>
  )
}
