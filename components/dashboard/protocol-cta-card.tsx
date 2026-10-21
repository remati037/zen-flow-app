'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ChevronRight } from 'lucide-react'

import { DoseCheckin } from '@/components/protocol/dose-checkin'
import { belgradeTimeHM, hmToMinutes } from '@/lib/dates'
import { streakRiskWindowStart } from '@/lib/push/dispatch-rules'
import { danaLabel, nextStreakMilestone } from '@/lib/protocol/milestones'
import type { TodayDoses } from '@/lib/protocol/queries'
import type { StreakResult } from '@/lib/protocol/streak'

const RISK_CHECK_INTERVAL_MS = 60_000

function takenCount(doses: TodayDoses): number {
  return (doses.morning === 'taken' ? 1 : 0) + (doses.evening === 'taken' ? 1 : 0)
}

/** Kratak status današnjeg dana ispod brojača niza. */
function statusLine(taken: number, streak: number): string {
  if (taken === 2) return 'Dan je kompletan.'
  if (taken === 1) return 'Još jedna doza danas.'
  if (streak === 0) return 'Prva doza pokreće niz.'
  return 'Današnje doze te čekaju.'
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

  // Napredak ka sledećem bedžu: od prethodnog praga do sledećeg.
  const milestoneProgress = milestone
    ? Math.min(1, Math.max(0, 1 - milestone.remaining / milestone.days))
    : 1

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-ink p-5 text-paper shadow-[0_24px_60px_-28px_rgba(32,56,73,0.55)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-paper/55 uppercase">Tvoj niz</p>
          <p className="mt-1 flex items-baseline gap-2" aria-live="polite">
            <span className="font-heading text-6xl leading-none font-semibold tracking-[-0.04em] text-lime tabular-nums">
              {current}
            </span>
            <span className="text-sm text-paper/75">
              {current === 1 ? 'dan zaredom' : 'dana zaredom'}
            </span>
          </p>
        </div>

        <Link
          href="/protokol"
          className="-mr-2 inline-flex min-h-11 items-center gap-0.5 rounded-full px-3 text-sm font-medium text-paper/70 transition-colors hover:bg-white/10 hover:text-paper"
        >
          Protokol
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {atRisk ? (
        <p className="mt-4 flex items-start gap-2 text-sm font-medium text-lime" role="status">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          Označi današnje doze do ponoći da niz od {current} {danaLabel(current)} ostane.
        </p>
      ) : (
        <div className="mt-4">
          {milestone ? (
            <>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-lime transition-[width] duration-700"
                  style={{ width: `${Math.round(milestoneProgress * 100)}%` }}
                />
              </div>
              <p className="mt-2 flex justify-between gap-3 text-xs text-paper/60">
                <span>{statusLine(taken, current)}</span>
                <span className="shrink-0 tabular-nums">
                  {milestone.remaining} {danaLabel(milestone.remaining)} do bedža
                </span>
              </p>
            </>
          ) : (
            <p className="text-xs text-paper/60">
              {statusLine(taken, current)} Najduži niz: {longest}.
            </p>
          )}
        </div>
      )}

      <div className="mt-5">
        <DoseCheckin
          today={today}
          doses={doses}
          morningTime={morningTime}
          eveningTime={eveningTime}
          variant="compact"
          onDosesChange={setLocalDoses}
        />
      </div>
    </section>
  )
}
