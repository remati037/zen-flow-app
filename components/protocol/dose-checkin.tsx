'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Sun, Sunrise } from 'lucide-react'
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
      icon: Sunrise,
      time: formatTime(morningTime),
      successMsg: 'Jutarnja doza je zabeležena.',
    },
    {
      dose: 'evening',
      label: 'Popodnevna doza',
      shortLabel: 'Popodne',
      icon: Sun,
      time: formatTime(eveningTime),
      successMsg: 'Popodnevna doza je zabeležena.',
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
      toast('Počeo je novi dan. Osvežavam prikaz.')
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
            ? 'Upis nije uspeo. Pokušaj ponovo.'
            : 'Nema internet veze. Označi dozu kad se veza vrati.',
        )
        return
      }
      if (result.ok) {
        const { streak, newBadges } = result.data
        if (completesDay && streak.todayComplete) {
          // Kompletan dan je jedinica napretka u protokolu — zaslužuje više od
          // običnog toast-a. Nov bedž već ispaljuje konfete; ne dupliramo ih.
          toast.success(`Dan je kompletan. Niz: ${streak.current} ${danaLabel(streak.current)}`)
          if (newBadges.length === 0) void fireConfetti()
          if ('vibrate' in navigator) navigator.vibrate(15)
        } else if (next === 'taken') {
          const cfg = config.find((c) => c.dose === dose)!
          toast.success(cfg.successMsg)
        } else {
          toast('Doza je poništena.')
        }
        celebrateNewBadges(newBadges)
        router.refresh()
      } else {
        applyState({ ...state, [dose]: prev }) // revert
        toast.error(result.error)
      }
    })
  }

  // `compact` živi na tamnoj (ink) glavnoj kartici dashboarda; `default` na svetloj
  // strani Protokola. Isti red, dve palete.
  const dark = compact

  return (
    <ul className="flex flex-col gap-2">
      {config.map((cfg) => {
        const status = state[cfg.dose]
        const taken = status === 'taken'
        const Icon = cfg.icon
        return (
          <li key={cfg.dose}>
            <button
              type="button"
              onClick={() => toggle(cfg.dose)}
              disabled={isPending}
              aria-pressed={taken}
              aria-label={`${cfg.label}${cfg.time ? ` u ${cfg.time}` : ''}: ${taken ? 'uzeta, dodirni da poništiš' : 'označi kao uzetu'}`}
              className={cn(
                'group flex min-h-16 w-full items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left transition-colors disabled:opacity-70',
                dark
                  ? taken
                    ? 'bg-lime text-ink'
                    : 'bg-white/[0.06] text-paper hover:bg-white/10'
                  : taken
                    ? 'bg-ink text-paper'
                    : 'bg-white text-ink ring-1 ring-ink/[0.08] hover:ring-ink/20',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl',
                  dark
                    ? taken
                      ? 'bg-ink/10 text-ink'
                      : 'bg-white/[0.08] text-paper/80'
                    : taken
                      ? 'bg-white/10 text-lime'
                      : 'bg-paper text-slate-mid',
                )}
              >
                <Icon className="size-5" strokeWidth={1.75} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-tight">{cfg.label}</span>
                <span
                  className={cn(
                    'mt-0.5 block text-xs tabular-nums',
                    taken ? 'opacity-70' : dark ? 'text-paper/55' : 'text-slate-soft',
                  )}
                >
                  {taken ? 'Uzeto' : cfg.time ? `u ${cfg.time}` : 'Bez podsetnika'}
                </span>
              </span>

              <span
                aria-hidden
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
                  taken
                    ? dark
                      ? 'bg-ink text-lime'
                      : 'bg-lime text-ink'
                    : dark
                      ? 'ring-[1.5px] ring-paper/30 group-hover:ring-paper/60'
                      : 'ring-[1.5px] ring-ink/20 group-hover:ring-ink/40',
                )}
              >
                {taken && <Check className="size-4" strokeWidth={2.5} />}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
