'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'

import { logDose } from '@/app/(app)/protokol/actions'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { TodayDoses, WeekStripDay } from '@/lib/protocol/queries'
import type { DayStatus } from '@/lib/protocol/streak'
import { cn } from '@/lib/utils'

type Dose = 'morning' | 'evening'

const WEEKDAY_LABELS = ['Ned', 'Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub'] as const

/** Srpski skraćeni naziv dana iz ISO datuma (čisto kalendarski, UTC parse). */
function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return WEEKDAY_LABELS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** 'YYYY-MM-DD' → 'ponedeljak, 14. jul' (srpski, latinica). */
function formatFullDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('sr-Latn-RS', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

const DOT_STYLES: Record<DayStatus, string> = {
  complete: 'bg-lime border-lime',
  partial: 'bg-lime/40 border-lime/40',
  missed: 'bg-slate-soft/20 border-slate-soft/25',
  frozen: 'border-dashed border-slate-soft/50 bg-transparent',
}

const DOT_TITLES: Record<DayStatus, string> = {
  complete: 'Obe doze uzete',
  partial: 'Jedna doza uzeta',
  missed: 'Propušteno',
  frozen: 'Pauza — nema aktivne porudžbine',
}

const DOSE_META: Record<Dose, { label: string; icon: typeof Sun }> = {
  morning: { label: 'Jutarnja doza', icon: Sun },
  evening: { label: 'Večernja doza', icon: Moon },
}

/**
 * 7-dnevni strip sa klikabilnim danima. Klik na dan otvara dijalog za naknadno
 * označavanje doza (backfill) — korisno kad se zaboravi da se štiklira.
 * Server (`logDose`) dozvoljava poslednjih 7 dana; stariji vrate grešku.
 */
export function WeekStrip({ weekStrip }: { weekStrip: WeekStripDay[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [openDate, setOpenDate] = useState<string | null>(null)
  const [localDoses, setLocalDoses] = useState<TodayDoses>({ morning: null, evening: null })

  function openDay(day: WeekStripDay) {
    setLocalDoses(day.doses)
    setOpenDate(day.date)
  }

  function toggle(dose: Dose) {
    if (!openDate || isPending) return
    const prev = localDoses[dose]
    const next: 'taken' | 'skipped' = prev === 'taken' ? 'skipped' : 'taken'

    setLocalDoses((s) => ({ ...s, [dose]: next })) // optimistično

    startTransition(async () => {
      const result = await logDose({ date: openDate, dose, status: next })
      if (result.ok) {
        toast.success(next === 'taken' ? 'Doza zabeležena 🌿' : 'Doza poništena.')
        router.refresh()
      } else {
        setLocalDoses((s) => ({ ...s, [dose]: prev })) // revert
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <div className="mt-6 flex items-end justify-between gap-1">
        {weekStrip.map((day) => (
          <button
            key={day.date}
            type="button"
            onClick={() => openDay(day)}
            title={`${DOT_TITLES[day.status]} — klikni za izmenu`}
            className="flex flex-1 flex-col items-center gap-1.5 rounded-lg py-1 transition-colors hover:bg-paper"
          >
            <span
              className={cn(
                'size-7 rounded-full border-2 transition-colors',
                DOT_STYLES[day.status],
                day.isToday && 'ring-2 ring-ink/60 ring-offset-2 ring-offset-white',
              )}
            />
            <span
              className={cn(
                'text-[10px] text-slate-soft',
                day.isToday && 'font-semibold text-ink',
              )}
            >
              {weekdayLabel(day.date)}
            </span>
          </button>
        ))}
      </div>

      <Dialog open={openDate !== null} onOpenChange={(o) => !o && setOpenDate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {openDate ? formatFullDay(openDate) : ''}
            </DialogTitle>
            <DialogDescription>
              Označi doze koje si uzeo tog dana. Menja i tvoj niz i zalihe.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            {(['morning', 'evening'] as Dose[]).map((dose) => {
              const taken = localDoses[dose] === 'taken'
              const Icon = DOSE_META[dose].icon
              return (
                <button
                  key={dose}
                  type="button"
                  onClick={() => toggle(dose)}
                  disabled={isPending}
                  aria-pressed={taken}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl p-4 text-center ring-1 transition-all disabled:opacity-70',
                    taken
                      ? 'bg-lime text-ink ring-lime'
                      : 'bg-white text-ink ring-foreground/10 hover:ring-foreground/20',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-11 items-center justify-center rounded-full',
                      taken ? 'bg-ink text-lime' : 'bg-paper text-slate-mid',
                    )}
                  >
                    {taken ? <Check className="size-6" /> : <Icon className="size-6" />}
                  </span>
                  <span className="font-heading text-sm font-medium">{DOSE_META[dose].label}</span>
                  <span className={cn('text-xs font-medium', taken ? 'text-ink' : 'text-slate-mid')}>
                    {taken ? 'Uzeto' : 'Označi'}
                  </span>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
