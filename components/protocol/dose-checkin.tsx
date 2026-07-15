'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Moon, Sun, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { logDose } from '@/app/(app)/protokol/actions'
import type { TodayDoses } from '@/lib/protocol/queries'
import { cn } from '@/lib/utils'

type Dose = 'morning' | 'evening'
type DoseStatus = 'taken' | 'skipped' | null

interface DoseConfig {
  dose: Dose
  label: string
  icon: typeof Sun
  time: string | null
  successMsg: string
}

/** 'HH:mm:ss' (Postgres time) → 'HH:mm'; null ostaje null. */
function formatTime(time: string | null): string | null {
  if (!time) return null
  return time.slice(0, 5)
}

export function DoseCheckin({
  today,
  doses,
  morningTime,
  eveningTime,
}: {
  today: string
  doses: TodayDoses
  morningTime: string | null
  eveningTime: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<Record<Dose, DoseStatus>>({
    morning: doses.morning,
    evening: doses.evening,
  })

  const config: DoseConfig[] = [
    {
      dose: 'morning',
      label: 'Jutarnja doza',
      icon: Sun,
      time: formatTime(morningTime),
      successMsg: 'Jutarnja doza zabeležena 🌿',
    },
    {
      dose: 'evening',
      label: 'Večernja doza',
      icon: Moon,
      time: formatTime(eveningTime),
      successMsg: 'Večernja doza zabeležena 🌙',
    },
  ]

  function toggle(dose: Dose) {
    if (isPending) return
    const prev = state[dose]
    const next: 'taken' | 'skipped' = prev === 'taken' ? 'skipped' : 'taken'

    // Optimistično
    setState((s) => ({ ...s, [dose]: next }))

    startTransition(async () => {
      const result = await logDose({ date: today, dose, status: next })
      if (result.ok) {
        if (next === 'taken') {
          const cfg = config.find((c) => c.dose === dose)!
          toast.success(cfg.successMsg)
        } else {
          toast('Doza poništena.')
        }
        router.refresh()
      } else {
        setState((s) => ({ ...s, [dose]: prev })) // revert
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {config.map((cfg) => {
        const status = state[cfg.dose]
        const taken = status === 'taken'
        const Icon = cfg.icon
        return (
          <button
            key={cfg.dose}
            type="button"
            onClick={() => toggle(cfg.dose)}
            disabled={isPending}
            aria-pressed={taken}
            className={cn(
              'flex flex-col items-center gap-3 rounded-xl p-6 text-center shadow-soft ring-1 transition-all',
              'disabled:opacity-70',
              taken
                ? 'bg-lime text-ink ring-lime'
                : 'bg-white text-ink ring-foreground/10 hover:ring-foreground/20',
            )}
          >
            <span
              className={cn(
                'flex size-14 items-center justify-center rounded-full',
                taken ? 'bg-ink text-lime' : 'bg-paper text-slate-mid',
              )}
            >
              {taken ? <Check className="size-7" /> : <Icon className="size-7" />}
            </span>

            <span className="font-heading text-lg font-medium">{cfg.label}</span>

            {cfg.time && (
              <span className="text-sm text-slate-soft">u {cfg.time}</span>
            )}

            <span
              className={cn(
                'mt-1 inline-flex items-center gap-1.5 text-sm font-medium',
                taken ? 'text-ink' : 'text-slate-mid',
              )}
            >
              {taken ? (
                <>
                  Uzeto <Undo2 className="size-3.5 opacity-60" />
                </>
              ) : (
                'Označi kao uzeto'
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
