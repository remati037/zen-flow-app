'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { mergeCustom } from '@/app/(admin)/admin/stack/actions'
import { Button } from '@/components/ui/button'
import { SUPPLEMENT_CATALOG } from '@/lib/supplements/catalog'

const OPTIONS = [...SUPPLEMENT_CATALOG].sort((a, b) => a.label.localeCompare(b.label, 'sr-Latn'))

export function MergeCustomForm({ name }: { name: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [intoKey, setIntoKey] = useState('')

  function merge() {
    if (intoKey === '') return
    startTransition(async () => {
      try {
        const result = await mergeCustom({ name, intoKey })
        if (result.ok) {
          toast.success(`Spojeno (${result.data.updated}).`)
          router.refresh()
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Nema veze. Pokušaj ponovo.')
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={`Spoji „${name}“ sa`}
        value={intoKey}
        onChange={(e) => setIntoKey(e.target.value)}
        className="min-h-11 rounded-xl border border-ink/15 bg-white px-3 text-sm text-ink"
      >
        <option value="">Spoji sa…</option>
        {OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <Button variant="dark" className="min-h-11 rounded-full px-4" onClick={merge} disabled={isPending || intoKey === ''}>
        Spoji
      </Button>
    </div>
  )
}
