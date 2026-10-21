'use client'

import { useEffect, useId, useState } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'

import { formatIsoDateSr } from '@/lib/dates'
import type { FocusTrend } from '@/lib/focus/score'
import { cn } from '@/lib/utils'

const DURATION_MS = 1400

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Focus Score kroz vreme (po uzoru na WHOOP procene): polukružni pokazivač sa
 * trenutnim skorom i oznakom polazne tačke, promena od početka, trend nedelje
 * i linija kroz dane. Pri prikazu se broj odbrojava, luk i linija se iscrtavaju.
 *
 * Skor je PROCENA iz doslednosti uzimanja i fokus blokova (`lib/focus/score.ts`),
 * pa to piše i ispod grafikona.
 */
export function FocusScoreCard({ trend }: { trend: FocusTrend }) {
  const uid = useId().replace(/:/g, '')
  const [p, setP] = useState(0)
  const current = trend.current

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const id = window.setTimeout(() => setP(1), 0)
      return () => window.clearTimeout(id)
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS)
      setP(easeOutCubic(t))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [current])

  const shown = Math.round(trend.baseline + (trend.current - trend.baseline) * p)
  const TrendIcon = trend.trend === 'up' ? ArrowUpRight : trend.trend === 'down' ? ArrowDownRight : ArrowRight
  const trendLabel =
    trend.trend === 'up'
      ? `Raste · +${trend.trendDelta} ove nedelje`
      : trend.trend === 'down'
        ? `Pada · ${trend.trendDelta} ove nedelje`
        : 'Stabilno ove nedelje'

  return (
    <section className="rounded-[24px] bg-white p-5 ring-1 ring-ink/[0.06] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-[0.14em] text-slate-soft uppercase">Focus Score</p>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
            trend.trend === 'up' && 'bg-lime-soft text-ink',
            trend.trend === 'down' && 'bg-caution-soft text-caution',
            trend.trend === 'flat' && 'bg-paper text-slate-mid',
          )}
        >
          <TrendIcon aria-hidden className="size-3.5" />
          {trendLabel}
        </span>
      </div>

      <Gauge value={trend.current} baseline={trend.baseline} progress={p} shown={shown} delta={trend.delta} />

      <dl className="mt-1 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-2xl bg-paper/70 px-3 py-2.5">
          <dt className="text-xs text-slate-soft">Polazna tačka</dt>
          <dd className="font-heading text-lg font-semibold text-ink tabular-nums">{trend.baseline}</dd>
        </div>
        <div className="rounded-2xl bg-paper/70 px-3 py-2.5">
          <dt className="text-xs text-slate-soft">Efekat protokola</dt>
          <dd className="font-heading text-lg font-semibold text-ink tabular-nums">{trend.effectPct}%</dd>
        </div>
      </dl>

      <TrendLine trend={trend} progress={p} gradientId={`fs-area-${uid}`} />

      <p className="mt-3 text-xs leading-relaxed text-slate-soft">
        Procena na osnovu redovnog uzimanja ZenFlow-a i fokus blokova. Polazna tačka je tvoj kviz.
        Efekat raste oko dve nedelje doslednosti i slabi kad pauziraš.
      </p>
    </section>
  )
}

/** Polukrug 0–100: luk do trenutnog skora, oznaka polazne tačke, broj u sredini. */
function Gauge({
  value,
  baseline,
  progress,
  shown,
  delta,
}: {
  value: number
  baseline: number
  progress: number
  shown: number
  delta: number
}) {
  const R = 84
  const CX = 100
  const CY = 100
  // Luk od 180° (levo) do 0° (desno), preko vrha.
  const point = (v: number) => {
    const a = Math.PI * (1 - v / 100)
    return { x: CX + R * Math.cos(a), y: CY - R * Math.sin(a) }
  }
  const arcLen = Math.PI * R
  const animated = baseline + (value - baseline) * progress
  const startFrom = Math.min(baseline, animated)
  const b = point(baseline)
  const bIn = { x: CX + (R - 12) * Math.cos(Math.PI * (1 - baseline / 100)), y: CY - (R - 12) * Math.sin(Math.PI * (1 - baseline / 100)) }

  return (
    <div className="relative mx-auto mt-3 w-full max-w-[260px]">
      <svg viewBox="0 0 200 112" className="w-full" aria-hidden>
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className="stroke-paper"
        />
        {/* Deo do polazne tačke (bledo) + rast iznad nje (ink) */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className="stroke-ink/15"
          strokeDasharray={`${(startFrom / 100) * arcLen} ${arcLen}`}
        />
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className="stroke-ink"
          // Dužina rasta, pomerena na polaznu tačku (offset), bez nulte crtice na
          // početku luka: zaobljen kraj bi od nje napravio tačku.
          strokeDasharray={`${(Math.abs(animated - baseline) / 100) * arcLen} ${arcLen * 2}`}
          strokeDashoffset={-(startFrom / 100) * arcLen}
          opacity={Math.abs(animated - baseline) < 0.5 ? 0 : 1}
        />
        {/* Oznaka polazne tačke */}
        <line x1={bIn.x} y1={bIn.y} x2={b.x} y2={b.y} strokeWidth="2.5" strokeLinecap="round" className="stroke-lime" />
        <circle cx={b.x} cy={b.y} r="2.5" className="fill-white stroke-ink/40" strokeWidth="1" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="font-heading text-5xl leading-none font-semibold tracking-[-0.04em] text-ink tabular-nums">
          {shown}
        </span>
        <span className="mt-1 text-xs text-slate-mid">
          {delta === 0 ? 'Polazna tačka' : `${delta > 0 ? '+' : ''}${delta} od početka`}
        </span>
      </div>
      <span className="sr-only">
        Focus Score {value} od 100, polazna tačka {baseline}.
      </span>
    </div>
  )
}

/** Linija skora kroz dane, sa isprekidanom polaznom tačkom i tačkom „danas". */
function TrendLine({ trend, progress, gradientId }: { trend: FocusTrend; progress: number; gradientId: string }) {
  const pts = trend.points
  if (pts.length < 2) {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-ink/10 px-4 py-5 text-center text-xs text-slate-soft">
        Linija napretka se crta od prvog dana protokola.
      </div>
    )
  }

  const W = 300
  const H = 96
  const PAD_Y = 8
  const scores = pts.map((p) => p.score).concat(trend.baseline)
  const lo = Math.max(0, Math.min(...scores) - 4)
  const hi = Math.min(100, Math.max(...scores) + 4)
  const x = (i: number) => (i / (pts.length - 1)) * W
  const y = (v: number) => PAD_Y + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - PAD_Y * 2)

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ')
  const area = `${line} L ${W} ${H} L 0 ${H} Z`
  const last = pts[pts.length - 1]
  const baseY = y(trend.baseline)

  return (
    <figure className="mt-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" className="[stop-color:var(--color-lime)]" stopOpacity="0.55" />
            <stop offset="1" className="[stop-color:var(--color-lime)]" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${gradientId}-reveal`}>
            <rect x="0" y="-10" width={W * progress} height={H + 20} />
          </clipPath>
        </defs>
        <line x1="0" x2={W} y1={baseY} y2={baseY} strokeDasharray="3 4" strokeWidth="1" className="stroke-slate-soft/60" vectorEffect="non-scaling-stroke" />
        <g clipPath={`url(#${gradientId}-reveal)`}>
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" strokeWidth="2" strokeLinejoin="round" className="stroke-ink" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      <div className="relative -mt-1 flex justify-between text-xs text-slate-soft">
        <span>{formatIsoDateSr(pts[0].date, { day: 'numeric', month: 'short' })}</span>
        <span>Polazna tačka (isprekidano)</span>
        <span className="font-medium text-ink">Danas {last.score}</span>
      </div>
    </figure>
  )
}
