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
      const data = (await res.json()) as { ok: boolean; sent: number; removed: number }
      if (data.sent > 0) {
        toast(`Test push poslat na ${data.sent} uređaj(a). 🌿`)
      } else {
        toast('Nemaš aktivnu pretplatu — uključi push podsetnike u Podešavanjima.')
      }
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
