'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Moon, Sun, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { logDose } from '@/app/(app)/protokol/actions'
import { celebrateNewBadges } from '@/components/badges/badge-toast'
import type { TodayDoses } from '@/lib/protocol/queries'
import { cn } from '@/lib/utils'

type Dose = 'morning' | 'evening'
type DoseStatus = 'taken' | 'skipped' | null

interface DoseConfig {
  dose: Dose
  label: string
  /** Kraći naziv za `compact` varijantu (dashboard). */
  shortLabel: string
  icon: typeof Sun
  time: string | null
  successMsg: string
}

/** 'HH:mm:ss' (Postgres time) → 'HH:mm'; null ostaje null. */
function formatTime(time: string | null): string | null {
  if (!time) return null
  return time.slice(0, 5)
}

/**
 * Inline check-in obe doze. `variant`:
 * - `default` — pune kartice na `/protokol`
 * - `compact` — niži par dugmadi za dashboard CTA karticu (isti kod, ista akcija)
 */
export function DoseCheckin({
  today,
  doses,
  morningTime,
  eveningTime,
  variant = 'default',
}: {
  today: string
  doses: TodayDoses
  morningTime: string | null
  eveningTime: string | null
  variant?: 'default' | 'compact'
}) {
  const compact = variant === 'compact'
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
      shortLabel: 'Jutro',
      icon: Sun,
      time: formatTime(morningTime),
      successMsg: 'Jutarnja doza zabeležena 🌿',
    },
    {
      dose: 'evening',
      label: 'Večernja doza',
      shortLabel: 'Veče',
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
        celebrateNewBadges(result.data.newBadges)
        router.refresh()
      } else {
        setState((s) => ({ ...s, [dose]: prev })) // revert
        toast.error(result.error)
      }
    })
  }

  return (
    <div className={cn('grid', compact ? 'grid-cols-2 gap-3' : 'gap-4 sm:grid-cols-2')}>
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
              'flex flex-col items-center rounded-xl text-center ring-1 transition-all',
              'disabled:opacity-70',
              compact ? 'gap-1.5 p-4' : 'gap-3 p-6 shadow-soft',
              taken
                ? 'bg-lime text-ink ring-lime'
                : 'bg-white text-ink ring-foreground/10 hover:ring-foreground/20',
            )}
          >
            <span
              className={cn(
                'flex items-center justify-center rounded-full',
                compact ? 'size-10' : 'size-14',
                taken ? 'bg-ink text-lime' : 'bg-paper text-slate-mid',
              )}
            >
              {taken ? (
                <Check className={compact ? 'size-5' : 'size-7'} />
              ) : (
                <Icon className={compact ? 'size-5' : 'size-7'} />
              )}
            </span>

            <span
              className={cn('font-heading font-medium', compact ? 'text-sm' : 'text-lg')}
            >
              {compact ? cfg.shortLabel : cfg.label}
            </span>

            {cfg.time && (
              <span className={cn('text-slate-soft', compact ? 'text-xs' : 'text-sm')}>
                u {cfg.time}
              </span>
            )}

            <span
              className={cn(
                'inline-flex items-center gap-1.5 font-medium',
                compact ? 'text-xs' : 'mt-1 text-sm',
                taken ? 'text-ink' : 'text-slate-mid',
              )}
            >
              {taken ? (
                <>
                  Uzeto <Undo2 className="size-3.5 opacity-60" />
                </>
              ) : compact ? (
                'Označi'
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
