'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, PackagePlus, Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { updateSupply } from '@/app/(app)/zalihe/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { CAPSULES_PER_PACKAGE, estimateDaysRemaining } from '@/lib/protocol/dosing'
import { cn } from '@/lib/utils'

/** Ispod ovoga (u kapsulama) zalihe su pri kraju — ~3.5 dana pri 4 kapsule/dan. */
const LOW_STOCK_THRESHOLD = 14

/** 'YYYY-MM-DD' → 'dd. mmm yyyy.' (srpski, latinica). Parse kao UTD da nema drifta. */
function formatRunout(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('sr-Latn-RS', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

export function SupplyCard({
  capsulesRemaining,
  estimatedRunoutDate,
  refillUrl,
}: {
  capsulesRemaining: number
  estimatedRunoutDate: string | null
  refillUrl: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(String(capsulesRemaining))

  const daysRemaining = estimateDaysRemaining(capsulesRemaining)
  const runoutLabel = formatRunout(estimatedRunoutDate)
  const isLow = capsulesRemaining <= LOW_STOCK_THRESHOLD
  // Referentni "pun" = jedno pakovanje (60 kapsula / 15 dana). Preko toga bar ostaje pun.
  const percent = Math.min(100, Math.round((capsulesRemaining / CAPSULES_PER_PACKAGE) * 100))

  function submit() {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('Unesi ispravan broj kapsula.')
      return
    }
    startTransition(async () => {
      const result = await updateSupply({ capsulesRemaining: parsed })
      if (result.ok) {
        toast.success('Zalihe ažurirane.')
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-5xl font-semibold tabular-nums text-ink">
              {capsulesRemaining}
            </span>
            <span className="text-sm font-medium text-slate-mid">kapsula</span>
          </div>
          <p className="mt-1 text-sm text-slate-mid">
            ≈ {daysRemaining} {daysRemaining === 1 ? 'dan' : 'dana'} preostalo
            {runoutLabel && (
              <>
                {' '}· ističe <span className="text-ink">{runoutLabel}</span>
              </>
            )}
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setValue(String(capsulesRemaining))}
            >
              <Pencil className="size-4" />
              Koriguj
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Koriguj zalihe</DialogTitle>
              <DialogDescription>
                Prebroji preostale kapsule i unesi tačan broj.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="capsules-remaining">Preostalo kapsula</Label>
              <Input
                id="capsules-remaining"
                type="number"
                min={0}
                max={1000}
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" disabled={isPending}>
                  Otkaži
                </Button>
              </DialogClose>
              <Button variant="dark" onClick={submit} disabled={isPending}>
                Sačuvaj
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Progress
        value={percent}
        className={cn(
          'mt-6 h-2',
          '[&_[data-slot=progress-indicator]]:transition-all',
          isLow
            ? '[&_[data-slot=progress-indicator]]:bg-amber-500'
            : '[&_[data-slot=progress-indicator]]:bg-lime',
        )}
      />

      {isLow && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>Zalihe su pri kraju — naruči dopunu da ne prekineš protokol.</span>
        </div>
      )}

      {refillUrl && (
        <Button variant="lime" size="lg" className="mt-6 w-full" asChild>
          <a href={refillUrl} target="_blank" rel="noopener noreferrer">
            <PackagePlus className="size-5" />
            Naruči dopunu
          </a>
        </Button>
      )}
    </div>
  )
}
