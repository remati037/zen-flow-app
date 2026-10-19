'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { DoseCheckin } from '@/components/protocol/dose-checkin'
import { belgradeTimeHM, hmToMinutes } from '@/lib/dates'
import { streakRiskWindowStart } from '@/lib/push/dispatch-rules'
import { danaLabel, nextStreakMilestone } from '@/lib/protocol/milestones'
import type { TodayDoses } from '@/lib/protocol/queries'
import type { StreakResult } from '@/lib/protocol/streak'
import { cn } from '@/lib/utils'

const RISK_CHECK_INTERVAL_MS = 60_000

function takenCount(doses: TodayDoses): number {
  return (doses.morning === 'taken' ? 1 : 0) + (doses.evening === 'taken' ? 1 : 0)
}

/** Kratak status današnjeg dana ispod brojača niza. */
function statusLine(taken: number, streak: number): string {
  if (taken === 2) return 'Dan je kompletan.'
  if (taken === 1) return 'Još jedna doza do kompletnog dana.'
  if (streak === 0) return 'Označi prvu dozu i pokreni svoj niz.'
  return 'Doze za danas te čekaju.'
}

/**
 * Glavni CTA dashboarda: brojač niza + inline check-in obe doze.
 *
 * Klijentska komponenta da bi brojač reagovao ODMAH na tap: `DoseCheckin` javlja
 * optimistično stanje, a niz se izvodi iz serverskog rezultata. Server broji
 * današnji dan samo ako je kompletan (`todayComplete`), pa je prikaz
 * `current − (server: danas kompletan) + (lokalno: danas kompletan)` — tačno
 * ono što će server vratiti posle upisa. Grešku `DoseCheckin` sam vraća
 * (revert), pa se i brojač vraća.
 *
 * Uz to:
 *  - sledeći bedž niza („još 2 dana do …") — cilj na dohvat ruke drži doslednost;
 *  - „niz u opasnosti" posle večernjeg termina ako dan nije kompletan — karta
 *    prelazi u tamnu (ink) varijantu, isti signal kao push `streak_at_risk`.
 */
export function ProtocolCtaCard({
  today,
  doses,
  streak,
  morningTime,
  eveningTime,
}: {
  today: string
  doses: TodayDoses
  streak: StreakResult
  morningTime: string | null
  eveningTime: string | null
}) {
  const [localDoses, setLocalDoses] = useState<TodayDoses>(doses)
  // Resync sa server props-ima posle `router.refresh()` / promene dana.
  const [syncedFrom, setSyncedFrom] = useState(doses)
  if (syncedFrom.morning !== doses.morning || syncedFrom.evening !== doses.evening) {
    setSyncedFrom(doses)
    setLocalDoses(doses)
  }

  const taken = takenCount(localDoses)
  const localComplete = taken === 2
  const current = Math.max(
    0,
    streak.current - (streak.todayComplete ? 1 : 0) + (localComplete ? 1 : 0),
  )
  const longest = Math.max(streak.longest, current)
  const milestone = nextStreakMilestone(current)

  // Vreme se proverava tek posle mount-a: server i klijent bi se oko granice
  // razišli u renderu (hydration mismatch), a karta mora da se osveži i kad
  // večernji termin prođe dok je app otvoren.
  // Isti trenutak kao push „niz u opasnosti" (najranije 21h): druga doza je
  // popodnevna, pa bi upozorenje od njenog termina (14h) bilo preuranjeno.
  const riskStartMin = streakRiskWindowStart(eveningTime ? hmToMinutes(eveningTime.slice(0, 5)) : null)
  const [pastRiskTime, setPastRiskTime] = useState(false)
  useEffect(() => {
    const check = () => setPastRiskTime(hmToMinutes(belgradeTimeHM()) >= riskStartMin)
    check()
    const id = window.setInterval(check, RISK_CHECK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [riskStartMin, today])

  const atRisk = pastRiskTime && !localComplete && current > 0

  return (
    <section
      className={cn(
        'rounded-xl p-5 shadow-soft ring-1 transition-colors',
        atRisk ? 'bg-ink text-paper ring-ink' : 'bg-white ring-foreground/10',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🔥
          </span>
          <div>
            <p className="flex items-baseline gap-1.5" aria-live="polite">
              <span
                className={cn(
                  'font-heading text-3xl font-semibold tabular-nums',
                  atRisk ? 'text-lime' : 'text-ink',
                )}
              >
                {current}
              </span>
              <span className={cn('text-sm font-medium', atRisk ? 'text-paper' : 'text-ink')}>
                {current === 1 ? 'dan zaredom' : 'dana zaredom'}
              </span>
            </p>
            <p className={cn('text-xs', atRisk ? 'text-paper/70' : 'text-slate-soft')}>
              {longest > 0 ? `Najduži niz: ${longest}` : 'Prvi niz počinje danas'}
            </p>
          </div>
        </div>

        <Link
          href="/protokol"
          className={cn(
            'inline-flex min-h-11 items-center gap-0.5 rounded-full px-3 text-sm font-medium transition-colors',
            atRisk
              ? 'text-paper/80 hover:bg-white/10 hover:text-paper'
              : 'text-slate-mid hover:bg-paper hover:text-ink',
          )}
        >
          Protokol
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {atRisk ? (
        <p className="mt-3 mb-4 text-sm font-medium text-lime" role="status">
          Označi današnje doze do ponoći da niz od {current} {danaLabel(current)} ostane.
        </p>
      ) : (
        <div className="mt-3 mb-4 space-y-0.5">
          <p className="text-sm text-slate-mid">{statusLine(taken, current)}</p>
          {milestone && (
            <p className="text-xs text-slate-soft">
              Još {milestone.remaining} {danaLabel(milestone.remaining)} do bedža{' '}
              <span className="font-medium text-ink">{milestone.title}</span>
            </p>
          )}
        </div>
      )}

      <DoseCheckin
        today={today}
        doses={doses}
        morningTime={morningTime}
        eveningTime={eveningTime}
        variant="compact"
        onDosesChange={setLocalDoses}
      />
    </section>
  )
}
