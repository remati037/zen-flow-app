'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts'

import type { DailyCheckins } from '@/lib/admin/metrics'
import { pluralSr } from '@/lib/format'

/** Boje iz brend tokena (globals.css) — SVG atributi primaju CSS var. */
const STROKE_LINE = 'var(--color-slate)'
const STROKE_DOT = 'var(--color-lime-deep)'
const STROKE_GRID = 'var(--line)'

function CheckinsTooltip({ active, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as DailyCheckins | undefined
  if (!active || !row) return null

  const [y, m, d] = row.date.split('-').map(Number)
  const dateLabel = new Intl.DateTimeFormat('sr-Latn-RS', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Date.UTC(y, m - 1, d)))

  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lift ring-1 ring-foreground/10">
      <p className="font-medium text-ink">{dateLabel}</p>
      <p className="text-slate-mid">
        {row.doses} {pluralSr(row.doses, 'doza', 'doze', 'doza')} · {row.users}{' '}
        {pluralSr(row.users, 'korisnik', 'korisnika', 'korisnika')}
      </p>
    </div>
  )
}

/**
 * Dnevni check-inovi (označene doze) kroz vreme. Podaci dolaze gotovi iz
 * `getAdminMetrics()` — komponenta ne radi nijedan fetch.
 */
export function CheckinsChart({ data }: { data: DailyCheckins[] }) {
  const hasData = data.some((d) => d.doses > 0)

  return (
    <section className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-mid">
          Check-inovi · poslednjih {data.length} dana
        </h2>
        <span className="text-xs text-slate-soft">
          ukupno {data.reduce((sum, d) => sum + d.doses, 0)} doza
        </span>
      </div>

      {hasData ? (
        <div className="mt-4 h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke={STROKE_GRID} vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={12}
                tickFormatter={(date: string) => String(Number(date.slice(8, 10)))}
                tick={{ fill: 'var(--color-slate-soft)', fontSize: 10 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fill: 'var(--color-slate-soft)', fontSize: 10 }}
              />
              <Tooltip cursor={false} content={CheckinsTooltip} wrapperStyle={{ outline: 'none' }} />
              <Line
                type="monotone"
                dataKey="doses"
                stroke={STROKE_LINE}
                strokeWidth={2}
                isAnimationActive={false}
                dot={{ r: 3, fill: STROKE_DOT, stroke: STROKE_LINE, strokeWidth: 1.5 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-soft">
          Još nema označenih doza u ovom periodu — grafikon se popunjava od prvog check-ina.
        </p>
      )}
    </section>
  )
}
