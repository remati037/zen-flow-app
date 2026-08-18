import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { DoseCheckin } from '@/components/protocol/dose-checkin'
import type { TodayDoses } from '@/lib/protocol/queries'
import type { StreakResult } from '@/lib/protocol/streak'

/** Kratak status današnjeg dana ispod streak brojača. */
function statusLine(doses: TodayDoses, streak: StreakResult): string {
  const taken =
    (doses.morning === 'taken' ? 1 : 0) + (doses.evening === 'taken' ? 1 : 0)
  if (taken === 2) return 'Dan je kompletan 🌿'
  if (taken === 1) return 'Još jedna doza do kompletnog dana.'
  if (streak.current === 0) return 'Označi prvu dozu i pokreni svoj niz.'
  return 'Doze za danas te čekaju.'
}

/**
 * Glavni CTA dashboarda: streak flame + inline check-in obe doze.
 * Check-in ide kroz `DoseCheckin` (compact) → ista `logDose` akcija kao na
 * `/protokol`, sa `revalidatePath('/dashboard')`, pa se streak osveži bez
 * navigacije. Server komponenta — sve interaktivno je u `DoseCheckin`.
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
  return (
    <section className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🔥
          </span>
          <div>
            <p className="flex items-baseline gap-1.5">
              <span className="font-heading text-3xl font-semibold tabular-nums text-ink">
                {streak.current}
              </span>
              <span className="text-sm font-medium text-ink">
                {streak.current === 1 ? 'dan zaredom' : 'dana zaredom'}
              </span>
            </p>
            <p className="text-xs text-slate-soft">
              {streak.longest > 0 ? `Najduži niz: ${streak.longest}` : 'Prvi niz počinje danas'}
            </p>
          </div>
        </div>

        <Link
          href="/protokol"
          className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-sm font-medium text-slate-mid transition-colors hover:bg-paper hover:text-ink"
        >
          Protokol
          <ChevronRight className="size-4" />
        </Link>
      </div>

      <p className="mt-3 mb-4 text-sm text-slate-mid">{statusLine(doses, streak)}</p>

      <DoseCheckin
        today={today}
        doses={doses}
        morningTime={morningTime}
        eveningTime={eveningTime}
        variant="compact"
      />
    </section>
  )
}
