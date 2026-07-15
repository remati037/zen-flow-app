import { WeekStrip } from '@/components/protocol/week-strip'
import type { WeekStripDay } from '@/lib/protocol/queries'
import type { StreakResult } from '@/lib/protocol/streak'

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

      <WeekStrip weekStrip={weekStrip} />
    </div>
  )
}
