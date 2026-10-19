'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Moon, Sun, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { logDose } from '@/app/(app)/protokol/actions'
import { celebrateNewBadges } from '@/components/badges/badge-toast'
import { fireConfetti } from '@/lib/confetti'
import { belgradeToday } from '@/lib/dates'
import { danaLabel } from '@/lib/protocol/milestones'
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
  onDosesChange,
}: {
  today: string
  doses: TodayDoses
  morningTime: string | null
  eveningTime: string | null
  variant?: 'default' | 'compact'
  /**
   * Javlja lokalno (optimistično) stanje doza — dashboard karta po njemu pomera
   * brojač niza odmah na tap, ne posle server round-trip-a.
   */
  onDosesChange?: (doses: TodayDoses) => void
}) {
  const compact = variant === 'compact'
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const staleRefreshFor = useRef<string | null>(null)
  const [state, setState] = useState<Record<Dose, DoseStatus>>({
    morning: doses.morning,
    evening: doses.evening,
  })

  // Resync sa server props-ima (posle `router.refresh()`, backfill-a iz WeekStrip-a
  // ili prelaska dana). `useState` inicijalizator važi samo na mount-u, pa bi
  // lokalno stanje inače zauvek pokazivalo prvi render.
  const [syncedFrom, setSyncedFrom] = useState({ today, morning: doses.morning, evening: doses.evening })
  if (
    syncedFrom.today !== today ||
    syncedFrom.morning !== doses.morning ||
    syncedFrom.evening !== doses.evening
  ) {
    setSyncedFrom({ today, morning: doses.morning, evening: doses.evening })
    setState({ morning: doses.morning, evening: doses.evening })
  }

  function applyState(next: Record<Dose, DoseStatus>) {
    setState(next)
    onDosesChange?.(next)
  }

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

    // Ekran otvoren preko ponoći: `today` je jučerašnji. `logDose` bi ga prihvatio
    // (u backfill prozoru je), pa bi tap upisao — ili poništio — jučerašnju dozu i
    // oborio niz. Ne šaljemo ništa; osvežavamo na pravi dan.
    // Samo JEDNOM po klijentskom danu: ako sat telefona odstupa od serverskog,
    // server posle refresh-a vrati isti `today` — tada je server izvor istine i
    // check-in mora da prođe, inače bi korisnik sa pogrešnim satom bio blokiran.
    const clientToday = belgradeToday()
    if (clientToday > today && staleRefreshFor.current !== clientToday) {
      staleRefreshFor.current = clientToday
      toast('Počeo je novi dan — osvežavam prikaz.')
      router.refresh()
      return
    }

    const prev = state[dose]
    const next: 'taken' | 'skipped' = prev === 'taken' ? 'skipped' : 'taken'
    const other: Dose = dose === 'morning' ? 'evening' : 'morning'
    // Ovaj tap zatvara dan (druga doza je već uzeta) → posebno slavlje.
    const completesDay = next === 'taken' && state[other] === 'taken'

    // Optimistično
    applyState({ ...state, [dose]: next })

    startTransition(async () => {
      let result: Awaited<ReturnType<typeof logDose>>
      try {
        result = await logDose({ date: today, dose, status: next })
      } catch {
        // Server akcija je fetch — bez mreže BACA, ne vraća `{ ok: false }`. Bez
        // ovoga je dugme ostajalo optimistično „Uzeto" iako ništa nije upisano.
        applyState({ ...state, [dose]: prev })
        toast.error(
          navigator.onLine
            ? 'Upis nije uspeo — pokušaj ponovo.'
            : 'Nema internet veze — označi dozu kad budeš online.',
        )
        return
      }
      if (result.ok) {
        const { streak, newBadges } = result.data
        if (completesDay && streak.todayComplete) {
          // Kompletan dan je jedinica napretka u protokolu — zaslužuje više od
          // običnog toast-a. Nov bedž već ispaljuje konfete; ne dupliramo ih.
          toast.success(`Dan je kompletan! Niz: ${streak.current} ${danaLabel(streak.current)} 🔥`)
          if (newBadges.length === 0) void fireConfetti()
          if ('vibrate' in navigator) navigator.vibrate(15)
        } else if (next === 'taken') {
          const cfg = config.find((c) => c.dose === dose)!
          toast.success(cfg.successMsg)
        } else {
          toast('Doza poništena.')
        }
        celebrateNewBadges(newBadges)
        router.refresh()
      } else {
        applyState({ ...state, [dose]: prev }) // revert
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
