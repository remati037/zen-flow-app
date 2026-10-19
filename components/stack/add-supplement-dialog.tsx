'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { toast } from 'sonner'

import { addSupplement } from '@/app/(app)/stack/actions'
import { TimeOfDayPicker } from '@/components/stack/time-of-day-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SUPPLEMENT_CATEGORIES, type SupplementCategory } from '@/lib/supplements/catalog'
import { normalizeSearch, searchCatalog } from '@/lib/supplements/search'
import type { TimeOfDay } from '@/lib/supplements/time-of-day'
import { cn } from '@/lib/utils'

type Picked = { catalogKey: string; name: string } | { customName: string; name: string }

export function AddSupplementDialog() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<SupplementCategory | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('morning')
  const [doseNote, setDoseNote] = useState('')

  const results = useMemo(() => searchCatalog(query, category ?? undefined), [query, category])
  const trimmed = query.trim()
  const hasExact = results.some((r) => normalizeSearch(r.label) === normalizeSearch(trimmed))

  function reset() {
    setQuery('')
    setCategory(null)
    setPicked(null)
    setTimeOfDay('morning')
    setDoseNote('')
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function submit() {
    if (!picked) return
    const target =
      'catalogKey' in picked ? { catalogKey: picked.catalogKey } : { customName: picked.customName }
    startTransition(async () => {
      try {
        const result = await addSupplement({ ...target, timeOfDay, doseNote })
        if (result.ok) {
          toast.success('Dodato u tvoj stack.')
          handleOpenChange(false)
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="lime" className="min-h-11 rounded-full px-5">
          <Plus aria-hidden className="size-4" />
          Dodaj suplement
        </Button>
      </DialogTrigger>
      <DialogContent>
        {picked === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Dodaj suplement</DialogTitle>
              <DialogDescription>Pretraži listu ili dodaj nešto što nije na njoj.</DialogDescription>
            </DialogHeader>

            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-soft"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="npr. kolagen, magnezijum, kreatin"
                aria-label="Pretraga suplemenata"
                className="min-h-11 pl-9"
                maxLength={60}
                autoComplete="off"
              />
            </div>

            {trimmed === '' && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Kategorije">
                {SUPPLEMENT_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={category === c.id}
                    onClick={() => setCategory(category === c.id ? null : c.id)}
                    className={cn(
                      'min-h-11 rounded-full px-3.5 text-xs font-medium ring-1 ring-ink/10 transition-colors',
                      category === c.id ? 'bg-ink text-paper' : 'bg-white text-ink hover:bg-paper',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            <ul className="max-h-64 divide-y divide-ink/[0.06] overflow-y-auto rounded-2xl ring-1 ring-ink/[0.06]">
              {results.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => setPicked({ catalogKey: r.key, name: r.label })}
                    className="flex min-h-11 w-full items-center px-4 py-2 text-left text-sm text-ink transition-colors hover:bg-paper"
                  >
                    {r.label}
                  </button>
                </li>
              ))}
              {trimmed.length >= 2 && !hasExact && (
                <li>
                  <button
                    type="button"
                    onClick={() => setPicked({ customName: trimmed, name: trimmed })}
                    className="flex min-h-11 w-full items-center px-4 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-paper"
                  >
                    Dodaj kao Drugo: „{trimmed}“
                  </button>
                </li>
              )}
            </ul>
            {results.length === 0 && trimmed.length < 2 && (
              <p className="text-xs text-slate-soft">Nema rezultata.</p>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{picked.name}</DialogTitle>
              <DialogDescription>Kad ga piješ i u kojoj dozi?</DialogDescription>
            </DialogHeader>

            <TimeOfDayPicker value={timeOfDay} onChange={setTimeOfDay} />

            <div className="space-y-1.5">
              <Label htmlFor="dose-note">Doza (opciono)</Label>
              <Input
                id="dose-note"
                value={doseNote}
                onChange={(e) => setDoseNote(e.target.value)}
                placeholder="npr. 400 mg"
                maxLength={40}
                className="min-h-11"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-11 flex-1 rounded-full"
                onClick={() => setPicked(null)}
                disabled={isPending}
              >
                Nazad
              </Button>
              <Button
                variant="lime"
                className="min-h-11 flex-1 rounded-full"
                onClick={submit}
                disabled={isPending}
              >
                Dodaj
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
