'use client'

import { useEffect, useId, useState } from 'react'

import { CAPSULES_PER_PACKAGE } from '@/lib/protocol/dosing'
import { pluralSr } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * ZenFlow tegla koja pokazuje koliko je kapsula ostalo.
 *
 * Crtež prati pravu ambalažu: niska mat crna tegla, čep iste širine, svetao
 * tanak natpis (NuroLab · ZENFLOW · FOKUS • ENERGIJA • KONCENTRACIJA ·
 * 60 kapsula | 100% veganski). Tegla je u stvarnosti neprovidna, pa se nivo
 * prikazuje kao „pogled kroz staklo": kapsule su blago vidljive do nivoa, a vrh
 * gomile označava tanka lime linija. Natpis ostaje čitljiv preko toga.
 *
 * Jedna tegla = jedno pakovanje (`CAPSULES_PER_PACKAGE`). Kad korisnik ima više
 * od jednog pakovanja, tegla pokazuje tekuću (načetu), a pune stoje kao oznaka
 * „+N pune". Tako 70 kapsula ne izgleda isto kao 60.
 *
 * Nivo se animira od dna pri prvom prikazu i pri svakoj korekciji; globalno
 * `prefers-reduced-motion` pravilo u `globals.css` gasi tranziciju.
 */

/** Unutrašnji prozor tegle u kom „stoje" kapsule (viewBox 160×236). */
const INNER = { x: 20, y: 80, w: 120, h: 140, r: 12 }

export function SupplyBottle({
  capsulesRemaining,
  low = false,
  className,
}: {
  capsulesRemaining: number
  low?: boolean
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const capsules = Math.max(0, Math.floor(capsulesRemaining))
  const extraFull = capsules > 0 ? Math.floor((capsules - 1) / CAPSULES_PER_PACKAGE) : 0
  const inCurrent = capsules - extraFull * CAPSULES_PER_PACKAGE
  const target = inCurrent / CAPSULES_PER_PACKAGE

  // Kreće od 0 i odmah posle prvog prikaza skoči na cilj, da se punjenje vidi.
  // `setTimeout`, ne `requestAnimationFrame`: rAF se ne izvršava u skrivenom tabu
  // (npr. app otvoren u pozadini), pa bi tegla ostala prazna do prvog fokusa.
  const [level, setLevel] = useState(0)
  useEffect(() => {
    const id = window.setTimeout(() => setLevel(target), 60)
    return () => window.clearTimeout(id)
  }, [target])

  const offset = (1 - level) * INNER.h

  return (
    <div className={cn('relative inline-flex flex-col items-center', className)}>
      <svg
        viewBox="0 0 160 236"
        className="h-60 w-auto drop-shadow-[0_22px_32px_rgba(20,24,26,0.28)]"
        role="img"
        aria-label={`Tekuća tegla: ${inCurrent} od ${CAPSULES_PER_PACKAGE} kapsula`}
      >
        <defs>
          <clipPath id={`inner-${uid}`}>
            <rect x={INNER.x} y={INNER.y} width={INNER.w} height={INNER.h} rx={INNER.r} />
          </clipPath>
          <pattern id={`caps-${uid}`} width="36" height="24" patternUnits="userSpaceOnUse">
            <Capsule x={4} y={4} low={low} />
            <Capsule x={21} y={16} low={low} tilt />
          </pattern>
          {/* Mat sjaj: blago svetlija leva ivica, kao na fotografiji. */}
          <linearGradient id={`sheen-${uid}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="white" stopOpacity="0.10" />
            <stop offset="0.18" stopColor="white" stopOpacity="0.03" />
            <stop offset="0.75" stopColor="white" stopOpacity="0" />
            <stop offset="1" stopColor="white" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Senka ispod */}
        <ellipse cx="80" cy="230" rx="62" ry="5" className="fill-ink/15" />

        {/* Telo tegle */}
        <rect x="10" y="68" width="140" height="160" rx="16" className="fill-jar" />

        {/* „Pogled kroz staklo": kapsule do nivoa */}
        <g clipPath={`url(#inner-${uid})`}>
          <g
            style={{ transform: `translateY(${offset}px)` }}
            className="transition-transform duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            <rect x={INNER.x} y={INNER.y} width={INNER.w} height={INNER.h} className="fill-white/[0.04]" />
            <rect x={INNER.x} y={INNER.y} width={INNER.w} height={INNER.h} fill={`url(#caps-${uid})`} />
            <rect
              x={INNER.x}
              y={INNER.y}
              width={INNER.w}
              height="1.5"
              className={low ? 'fill-caution-line' : 'fill-lime'}
            />
          </g>
        </g>

        {/* Natpis kao na tegli */}
        <text x="80" y="128" textAnchor="middle" className="fill-paper/80 text-[9px] font-semibold tracking-[-0.01em]">
          NuroLab
        </text>
        <text
          x="81"
          y="152"
          textAnchor="middle"
          className="fill-paper/90 text-[17px] font-light tracking-[0.16em]"
        >
          ZENFLOW
        </text>
        <rect x="27" y="192" width="106" height="11" rx="5.5" fill="none" className="stroke-paper/55" strokeWidth="0.6" />
        <text x="80" y="199.6" textAnchor="middle" className="fill-paper/75 text-[5px] font-semibold tracking-[0.04em]">
          FOKUS • ENERGIJA • KONCENTRACIJA
        </text>
        <text x="80" y="212" textAnchor="middle" className="fill-paper/60 text-[5px]">
          60 kapsula | 100% veganski
        </text>

        {/* Mat sjaj preko tela */}
        <rect x="10" y="68" width="140" height="160" rx="16" fill={`url(#sheen-${uid})`} />

        {/* Čep: iste širine, zaobljen gornji obod, spoj sa teglom */}
        <rect x="9" y="8" width="142" height="62" rx="14" className="fill-jar-cap" />
        <rect x="9" y="8" width="142" height="62" rx="14" fill={`url(#sheen-${uid})`} />
        <rect x="9" y="64" width="142" height="4" className="fill-black/30" />
        <rect x="12" y="10" width="136" height="3" rx="1.5" className="fill-white/[0.06]" />
      </svg>

      {extraFull > 0 && (
        <span className="mt-3 rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper">
          + {extraFull} {pluralSr(extraFull, 'puna tegla', 'pune tegle', 'punih tegli')}
        </span>
      )}
    </div>
  )
}

/** Jedna kapsula iz uzorka: dvobojna, blago vidljiva kroz teglu. */
function Capsule({ x, y, low, tilt = false }: { x: number; y: number; low: boolean; tilt?: boolean }) {
  return (
    <g transform={tilt ? `rotate(-16 ${x + 6} ${y + 3})` : undefined} opacity="0.22">
      <rect x={x} y={y} width="13" height="6" rx="3" className="fill-paper" />
      <rect x={x} y={y} width="6.5" height="6" rx="3" className={low ? 'fill-caution-line' : 'fill-lime'} />
    </g>
  )
}
