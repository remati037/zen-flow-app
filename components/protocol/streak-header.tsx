import type { WeekStripDay } from '@/lib/protocol/queries'
import type { DayStatus } from '@/lib/protocol/streak'
import type { StreakResult } from '@/lib/protocol/streak'
import { cn } from '@/lib/utils'

const WEEKDAY_LABELS = ['Ned', 'Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub'] as const

/** Srpski skraćeni naziv dana iz ISO datuma (čisto kalendarski, UTC parse). */
function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return WEEKDAY_LABELS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
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

export function StreakHeader({
  streak,
  weekStrip,
}: {
  streak: StreakResult
  weekStrip: WeekStripDay[]
}) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-foreground/10">
      <div className="flex items-center gap-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl" aria-hidden>
            🔥
          </span>
          <span className="font-heading text-5xl font-semibold tabular-nums text-ink">
            {streak.current}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-ink">
            {streak.current === 1 ? 'dan zaredom' : 'dana zaredom'}
          </span>
          <span className="text-xs text-slate-soft">
            Najduži niz: {streak.longest}
          </span>
        </div>
      </div>

      <div className="mt-6 flex items-end justify-between gap-1">
        {weekStrip.map((day) => (
          <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              title={DOT_TITLES[day.status]}
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
          </div>
        ))}
      </div>
    </div>
  )
}
