import { WeekStrip } from '@/components/protocol/week-strip'
import type { WeekStripDay } from '@/lib/protocol/queries'
import type { StreakResult } from '@/lib/protocol/streak'

/** Niz + poslednjih 7 dana. Isti tipografski brojač kao na dashboardu, bez ikonica. */
export function StreakHeader({
  streak,
  weekStrip,
}: {
  streak: StreakResult
  weekStrip: WeekStripDay[]
}) {
  return (
    <section className="rounded-[24px] bg-white p-5 ring-1 ring-ink/[0.06] sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-slate-soft uppercase">Tvoj niz</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-heading text-6xl leading-none font-semibold tracking-[-0.04em] text-ink tabular-nums">
              {streak.current}
            </span>
            <span className="text-sm text-slate-mid">
              {streak.current === 1 ? 'dan zaredom' : 'dana zaredom'}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-soft">Najduži</p>
          <p className="font-heading text-lg font-semibold text-ink tabular-nums">{streak.longest}</p>
        </div>
      </div>

      <WeekStrip weekStrip={weekStrip} />
    </section>
  )
}
