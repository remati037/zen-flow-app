'use client'

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts'

import { DOSES_PER_DAY } from '@/lib/protocol/dosing'
import type { WeekStripDay } from '@/lib/protocol/queries'

interface ChartDay {
  date: string
  /** Broj uzetih doza tog dana: 0, 1 ili 2. */
  taken: number
  /** Dan bez aktivne porudžbine — niz je pauziran, nije propušten. */
  frozen: boolean
  isToday: boolean
  /** Dan u mesecu kao oznaka na X osi. */
  label: string
}

/** Boje se čitaju iz brend tokena (globals.css) — SVG fill prima CSS var. */
const FILL_COMPLETE = 'var(--color-lime)'
const FILL_PARTIAL = 'var(--color-mint)'
const FILL_FROZEN = 'var(--color-muted)'
const FILL_TRACK = 'var(--color-paper)'

function toChartDay(day: WeekStripDay): ChartDay {
  const taken =
    (day.doses.morning === 'taken' ? 1 : 0) + (day.doses.evening === 'taken' ? 1 : 0)
  return {
    date: day.date,
    taken,
    frozen: day.status === 'frozen',
    isToday: day.isToday,
    label: String(Number(day.date.slice(8, 10))),
  }
}

function AdherenceTooltip({ active, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as ChartDay | undefined
  if (!active || !row) return null

  const [y, m, d] = row.date.split('-').map(Number)
  const dateLabel = new Intl.DateTimeFormat('sr-Latn-RS', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Date.UTC(y, m - 1, d)))

  const dosesLabel = row.frozen
    ? 'pauza (bez aktivne porudžbine)'
    : row.taken === 0
      ? 'nijedna doza'
      : `${row.taken} ${row.taken === 1 ? 'doza' : 'doze'}`

  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lift ring-1 ring-foreground/10">
      <p className="font-medium text-ink">{dateLabel}</p>
      <p className="text-slate-mid">{dosesLabel}</p>
    </div>
  )
}

/**
 * Doslednost poslednjih N dana: po jedan bar dnevno, visina = broj uzetih doza
 * (0/1/2). Lime = pun dan, mint = pola dana, prazan trag = propušteno ili
 * pauzirano. Podaci dolaze iz `getProtocolState(profile, { stripDays })` —
 * nema zasebnog upita ni client fetch-a.
 */
export function AdherenceChart({ days }: { days: WeekStripDay[] }) {
  const data = days.map(toChartDay)
  const hasData = data.some((d) => d.taken > 0)
  const completeDays = data.filter((d) => d.taken === DOSES_PER_DAY).length

  return (
    <section className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-mid">
          Doslednost · poslednjih {data.length} dana
        </h2>
        {hasData && (
          <span className="text-xs text-slate-soft">
            {completeDays} {completeDays === 1 ? 'pun dan' : 'punih dana'}
          </span>
        )}
      </div>

      {hasData ? (
        <div className="mt-4 h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="18%">
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={{ fill: 'var(--color-slate-soft)', fontSize: 10 }}
                minTickGap={0}
              />
              <YAxis hide domain={[0, DOSES_PER_DAY]} />
              <Tooltip
                cursor={false}
                content={AdherenceTooltip}
                wrapperStyle={{ outline: 'none' }}
              />
              <Bar
                dataKey="taken"
                radius={[6, 6, 6, 6]}
                isAnimationActive={false}
                background={{ fill: FILL_TRACK, radius: 6 }}
              >
                {data.map((d) => (
                  <Cell
                    key={d.date}
                    fill={d.frozen ? FILL_FROZEN : d.taken === DOSES_PER_DAY ? FILL_COMPLETE : FILL_PARTIAL}
                    stroke={d.isToday ? 'var(--color-ink)' : undefined}
                    strokeWidth={d.isToday ? 1.5 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <>
          <div className="mt-4 flex h-20 items-end gap-1.5" aria-hidden>
            {data.map((d) => (
              <div key={d.date} className="h-2 flex-1 rounded-full bg-paper" />
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-soft">
            Grafikon se popunjava od prve označene doze — svaki pun dan je jedan lime stubić.
          </p>
        </>
      )}
    </section>
  )
}
