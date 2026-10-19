'use client'

import { useEffect, useId, useState } from 'react'

import { CAPSULES_PER_PACKAGE } from '@/lib/protocol/dosing'
import { pluralSr } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Bočica ZenFlow-a koja se puni kapsulama srazmerno preostalim zalihama.
 *
 * MOCKUP crtež dok ne stigne prava bočica: geometrija je u konstantama ispod,
 * pa se zamena svodi na novi obris (`BODY`, čep, etiketa) — logika punjenja ostaje.
 *
 * Jedna bočica = jedno pakovanje (`CAPSULES_PER_PACKAGE`). Kad korisnik ima više
 * od jednog pakovanja, bočica pokazuje tekuću (načetu) a pune stoje kao oznaka
 * „+N pune”. Tako 70 kapsula ne izgleda isto kao 60.
 *
 * Nivo se animira od dna pri prvom prikazu i pri svakoj korekciji; globalno
 * `prefers-reduced-motion` pravilo u `globals.css` gasi tranziciju.
 */

/** Unutrašnjost bočice u kojoj stoje kapsule (koordinate viewBox-a 140×220). */
const INNER = { x: 20, y: 64, w: 100, h: 142, r: 20 }

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
  // (npr. app otvoren u pozadini), pa bi bočica ostala prazna do prvog fokusa.
  const [level, setLevel] = useState(0)
  useEffect(() => {
    const id = window.setTimeout(() => setLevel(target), 60)
    return () => window.clearTimeout(id)
  }, [target])

  const offset = (1 - level) * INNER.h

  return (
    <div className={cn('relative inline-flex flex-col items-center', className)}>
      <svg
        viewBox="0 0 140 230"
        className="h-56 w-auto drop-shadow-[0_18px_30px_rgba(32,56,73,0.14)]"
        role="img"
        aria-label={`Tekuća bočica: ${inCurrent} od ${CAPSULES_PER_PACKAGE} kapsula`}
      >
        <defs>
          <clipPath id={`inner-${uid}`}>
            <rect x={INNER.x} y={INNER.y} width={INNER.w} height={INNER.h} rx={INNER.r} />
          </clipPath>
          {/* Kapsule kao uzorak: dve po redu, svaki drugi red pomeren. */}
          <pattern id={`caps-${uid}`} width="40" height="26" patternUnits="userSpaceOnUse">
            <Capsule x={2} y={3} low={low} />
            <Capsule x={22} y={15} low={low} rotate />
          </pattern>
          <linearGradient id={`glass-${uid}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="white" stopOpacity="0.55" />
            <stop offset="0.35" stopColor="white" stopOpacity="0.08" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Senka ispod */}
        <ellipse cx="70" cy="222" rx="46" ry="5" className="fill-ink/10" />

        {/* Telo bočice */}
        <rect x="14" y="56" width="112" height="158" rx="26" className="fill-white stroke-ink/15" strokeWidth="1.5" />

        {/* Kapsule — grupa se pomera nagore koliko je bočica puna */}
        <g clipPath={`url(#inner-${uid})`}>
          <g
            style={{ transform: `translateY(${offset}px)` }}
            className="transition-transform duration-[1400ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            <rect
              x={INNER.x}
              y={INNER.y}
              width={INNER.w}
              height={INNER.h}
              className={low ? 'fill-caution-soft' : 'fill-lime-soft'}
            />
            <rect x={INNER.x} y={INNER.y} width={INNER.w} height={INNER.h} fill={`url(#caps-${uid})`} />
            <rect
              x={INNER.x}
              y={INNER.y}
              width={INNER.w}
              height="2"
              className={low ? 'fill-caution/40' : 'fill-ink/15'}
            />
          </g>
        </g>

        {/* Etiketa — providna, da se nivo kapsula vidi i iza nje */}
        <rect x="14" y="118" width="112" height="48" className="fill-white/75" />
        <text
          x="70"
          y="141"
          textAnchor="middle"
          className="fill-ink font-heading text-[15px] font-semibold tracking-[-0.02em]"
        >
          ZenFlow
        </text>
        <text
          x="70"
          y="156"
          textAnchor="middle"
          className="fill-slate-soft text-[7.5px] font-medium tracking-[0.18em] uppercase"
        >
          NuroLab · 60 kaps.
        </text>

        {/* Odsjaj stakla */}
        <rect x="14" y="56" width="112" height="158" rx="26" fill={`url(#glass-${uid})`} />

        {/* Grlo i čep */}
        <rect x="44" y="40" width="52" height="18" rx="4" className="fill-white stroke-ink/15" strokeWidth="1.5" />
        <rect x="38" y="8" width="64" height="36" rx="9" className="fill-ink" />
        {[50, 58, 66, 74, 82, 90].map((x) => (
          <rect key={x} x={x - 0.75} y="13" width="1.5" height="26" rx="0.75" className="fill-white/15" />
        ))}
      </svg>

      {extraFull > 0 && (
        <span className="mt-2 rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper">
          + {extraFull} {pluralSr(extraFull, 'puna bočica', 'pune bočice', 'punih bočica')}
        </span>
      )}
    </div>
  )
}

/** Jedna kapsula iz uzorka: dvobojna, zaobljena. */
function Capsule({ x, y, low, rotate = false }: { x: number; y: number; low: boolean; rotate?: boolean }) {
  return (
    <g transform={rotate ? `rotate(-18 ${x + 8} ${y + 4})` : undefined}>
      <rect x={x} y={y} width="17" height="8" rx="4" className="fill-white stroke-ink/20" strokeWidth="0.6" />
      <rect x={x} y={y} width="8.5" height="8" rx="4" className={low ? 'fill-caution/80' : 'fill-ink/80'} />
    </g>
  )
}
