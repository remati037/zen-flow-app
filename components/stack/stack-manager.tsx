'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { updateSupplement } from '@/app/(app)/stack/actions'
import { EditSupplementDialog } from '@/components/stack/edit-supplement-dialog'
import { Switch } from '@/components/ui/switch'
import { supplementDisplayName } from '@/lib/supplements/catalog'
import { TIMES_OF_DAY, TIME_LABELS } from '@/lib/supplements/time-of-day'
import type { StackRow } from '@/lib/supplements/types'

function StackItem({ row }: { row: StackRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [stillTaking, setStillTaking] = useState(true)
  const name = supplementDisplayName(row.catalogKey, row.customName)

  // Prekidač može samo da UKLONI stavku (server prima isključivo `active: false`);
  // ponovno dodavanje ide kroz „Dodaj suplement". Zato je isključen prekidač onemogućen.
  function toggle(next: boolean) {
    if (next) return
    // Optimistično; vraća se na staro ako server odbije ili nema mreže.
    setStillTaking(false)
    startTransition(async () => {
      try {
        const result = await updateSupplement({ id: row.id, active: false })
        if (result.ok) {
          toast.success('Uklonjeno sa liste.')
          router.refresh()
        } else {
          setStillTaking(true)
          toast.error(result.error)
        }
      } catch {
        setStillTaking(true)
        toast.error('Nema veze. Pokušaj ponovo.')
      }
    })
  }

  return (
    <li className="flex min-h-14 items-center gap-2 py-1 pr-4 pl-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{name}</p>
        {row.doseNote && <p className="truncate text-xs text-slate-soft">{row.doseNote}</p>}
      </div>
      <EditSupplementDialog row={row} />
      <Switch
        checked={stillTaking}
        onCheckedChange={toggle}
        disabled={!stillTaking || isPending}
        aria-label={`Još pijem: ${name}`}
        className="after:-inset-y-3.5"
      />
    </li>
  )
}

/** Stack grupisan po dobu dana; prazne grupe se ne prikazuju. */
export function StackManager({ rows }: { rows: StackRow[] }) {
  return (
    <div className="space-y-4">
      {TIMES_OF_DAY.map((t) => {
        const inGroup = rows.filter((r) => r.timeOfDay === t)
        if (inGroup.length === 0) return null
        return (
          <section key={t} aria-labelledby={`stack-${t}`}>
            <h2 id={`stack-${t}`} className="mb-2 px-1 text-xs font-medium tracking-wide text-slate-soft uppercase">
              {TIME_LABELS[t]}
            </h2>
            <ul className="divide-y divide-ink/[0.06] overflow-hidden rounded-[24px] bg-white ring-1 ring-ink/[0.06]">
              {inGroup.map((r) => (
                <StackItem key={r.id} row={r} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
