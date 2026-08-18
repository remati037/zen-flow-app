'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

type BackfillResponse = {
  ok?: boolean
  pages?: number
  created?: number
  updated?: number
  skipped?: number
  accessRefreshed?: number
  error?: string
}

/**
 * Pokreće postojeći `/api/admin/woocommerce/backfill` (admin-gated POST) i
 * prikazuje rezultat. Backfill može da traje — dugme ostaje disabled do odgovora.
 */
export function BackfillButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/woocommerce/backfill', { method: 'POST' })

      if (res.status === 401 || res.status === 403) {
        toast.error('Nemaš admin dozvolu za backfill.')
        setResult('Odbijeno: nedostaje admin dozvola.')
        return
      }

      const raw = await res.text()
      let data: BackfillResponse = {}
      try {
        data = JSON.parse(raw) as BackfillResponse
      } catch {
        // Ruta na 500 zbog Woo kredencijala vraća plain text.
        toast.error('Backfill nije uspeo.')
        setResult(raw.slice(0, 300) || `Greška ${res.status}.`)
        return
      }

      if (!res.ok || data.error) {
        toast.error('Backfill nije uspeo.')
        setResult(
          `${data.error ?? `Greška ${res.status}`} · novih ${data.created ?? 0}, ažuriranih ${data.updated ?? 0}, preskočenih ${data.skipped ?? 0}.`,
        )
        return
      }

      const summary = `Strana: ${data.pages ?? 0} · novih ${data.created ?? 0}, ažuriranih ${data.updated ?? 0}, preskočenih ${data.skipped ?? 0} · osvežen pristup za ${data.accessRefreshed ?? 0}.`
      setResult(summary)
      toast.success('Backfill završen.')
      router.refresh()
    } catch {
      toast.error('Poziv nije uspeo. Pokušaj ponovo.')
      setResult('Mrežna greška — poziv nije stigao do servera.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={run} disabled={loading} variant="dark">
        <RefreshCw className={loading ? 'animate-spin' : undefined} />
        {loading ? 'Backfill u toku…' : 'Pokreni backfill'}
      </Button>
      {result && <p className="text-xs text-slate-mid">{result}</p>}
    </div>
  )
}
