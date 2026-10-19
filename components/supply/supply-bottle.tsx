'use client'

import { useEffect, useId, useRef, useState } from 'react'

import { CAPSULES_PER_PACKAGE } from '@/lib/protocol/dosing'
import { pluralSr } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * ZenFlow tegla koja se PUNI do nivoa preostalih kapsula.
 *
 * Crtež prati render ambalaže (proporcije, čep iste širine, natpis NuroLab ·
 * ZENFLOW · FOKUS • ENERGIJA • KONCENTRACIJA · 60 kapsula | 100% veganski).
 * Dva sloja iste tegle:
 *  - „duh" (svetla, prazna tegla) — koliko staje;
 *  - prava, crna tegla, otkrivena odozdo do nivoa, sa blago talasastom ivicom i
 *    tankom lime linijom (pri kraju zaliha: topla linija).
 *
 * Animacija se vozi u JS-u (tween nivoa + faza talasa), ne CSS transform-om
 * unutar `clipPath`-a — to Safari na iOS-u ne animira pouzdano. Talas se smiri
 * kad punjenje stane, pa nema stalnog pokreta na ekranu. Uz „Smanji pokrete"
 * tegla odmah stoji na nivou.
 *
 * Jedna tegla = jedno pakovanje (`CAPSULES_PER_PACKAGE`). Za više pakovanja
 * tegla pokazuje tekuće (načeto), a pune stoje kao „+N pune tegle".
 */

/** Geometrija tegle u viewBox-u 162×242 (izvedena iz rendera, ~1:5). */
const CAP = { x: 2, y: 2, w: 158, h: 49, r: 9 }
const BODY = { x: 1, y: 53, w: 160, h: 186, r: 13 }
/** Visina koju nivo pokriva: od dna tela do vrha čepa (tegla se puni cela). */
const FILL_TOP = CAP.y
const FILL_BOTTOM = BODY.y + BODY.h
const FILL_H = FILL_BOTTOM - FILL_TOP

const DURATION_MS = 1600
const WAVE_AMP = 2.4
const WAVE_LEN = 54

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** Tačke talasastog vrha „tečnosti" na visini `y`, šire od tegle (seče ih clip). */
function wavePoints(y: number, amp: number, phase: number): string[] {
  const left = -10
  const right = 172
  const steps = 24
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const x = left + ((right - left) * i) / steps
    const yy = y + Math.sin((x / WAVE_LEN) * Math.PI * 2 + phase) * amp
    pts.push(`${x.toFixed(2)} ${yy.toFixed(2)}`)
  }
  return pts
}

/** Zatvorena površina „tečnosti": talasasti vrh, pa dole do dna tegle. */
function fillPath(y: number, amp: number, phase: number): string {
  const pts = wavePoints(y, amp, phase)
  return `M -10 ${FILL_BOTTOM + 4} L ${pts.join(' L ')} L 172 ${FILL_BOTTOM + 4} Z`
}

/** Samo talasasta ivica (za tanku liniju nivoa). */
function edgePath(y: number, amp: number, phase: number): string {
  const [first, ...rest] = wavePoints(y, amp, phase)
  return `M ${first} L ${rest.join(' L ')}`
}

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

  // Animirano stanje: nivo (0–1), amplituda i faza talasa.
  const [frame, setFrame] = useState({ level: 0, amp: WAVE_AMP, phase: 0 })
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      fromRef.current = target
      const id = window.setTimeout(() => setFrame({ level: target, amp: 0, phase: 0 }), 0)
      return () => window.clearTimeout(id)
    }

    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS)
      const level = from + (target - from) * easeOutCubic(t)
      // Talas je živ dok se puni, pa se smiri na blagu ivicu.
      const amp = WAVE_AMP * (1 - t) + 0.8 * t
      setFrame({ level, amp, phase: (now - start) / 260 })
      fromRef.current = level
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  const levelY = FILL_BOTTOM - frame.level * FILL_H
  const showEdge = frame.level > 0.005 && frame.level < 0.995

  return (
    <div className={cn('relative inline-flex flex-col items-center', className)}>
      <svg
        viewBox="0 0 162 248"
        className="h-64 w-auto"
        role="img"
        aria-label={`Tekuća tegla: ${inCurrent} od ${CAPSULES_PER_PACKAGE} kapsula`}
      >
        <defs>
          <clipPath id={`fill-${uid}`}>
            <path d={fillPath(levelY, frame.amp, frame.phase)} />
          </clipPath>
          {/* Mat sjaj kao na renderu: svetlija leva ivica, tamnija sredina. */}
          <linearGradient id={`sheen-${uid}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="white" stopOpacity="0.09" />
            <stop offset="0.12" stopColor="white" stopOpacity="0.035" />
            <stop offset="0.55" stopColor="white" stopOpacity="0" />
            <stop offset="0.92" stopColor="white" stopOpacity="0.03" />
            <stop offset="1" stopColor="white" stopOpacity="0.07" />
          </linearGradient>
        </defs>

        {/* Senka */}
        <ellipse cx="81" cy="243" rx="70" ry="4" className="fill-ink/10" />

        {/* „Duh" — prazna tegla */}
        <Jar tone="ghost" sheenId={`sheen-${uid}`} />

        {/* Prava tegla, otkrivena do nivoa */}
        <g clipPath={`url(#fill-${uid})`}>
          <Jar tone="solid" sheenId={`sheen-${uid}`} />
        </g>

        {/* Ivica punjenja */}
        {showEdge && (
          <g clipPath={`url(#jar-shape-${uid})`}>
            <path
              d={edgePath(levelY, frame.amp, frame.phase)}
              fill="none"
              strokeWidth="1.4"
              className={low ? 'stroke-caution-line' : 'stroke-lime'}
            />
          </g>
        )}
        <clipPath id={`jar-shape-${uid}`}>
          <rect x={CAP.x} y={CAP.y} width={CAP.w} height={CAP.h} rx={CAP.r} />
          <rect x={BODY.x} y={BODY.y} width={BODY.w} height={BODY.h} rx={BODY.r} />
        </clipPath>
      </svg>

      {extraFull > 0 && (
        <span className="mt-2 rounded-full bg-ink px-3 py-1 text-xs font-medium text-paper">
          + {extraFull} {pluralSr(extraFull, 'puna tegla', 'pune tegle', 'punih tegli')}
        </span>
      )}
    </div>
  )
}

/** Tegla u dve varijante: `solid` (proizvod) i `ghost` (prazna, svetla). */
function Jar({ tone, sheenId }: { tone: 'solid' | 'ghost'; sheenId: string }) {
  const solid = tone === 'solid'
  const text = solid ? 'fill-paper' : 'fill-ink/15'
  return (
    <g className="font-sans">
      {/* Telo */}
      <rect
        x={BODY.x}
        y={BODY.y}
        width={BODY.w}
        height={BODY.h}
        rx={BODY.r}
        className={solid ? 'fill-jar' : 'fill-ink/[0.045] stroke-ink/15'}
        strokeWidth={solid ? 0 : 0.8}
      />
      {/* Čep + spoj */}
      <rect
        x={CAP.x}
        y={CAP.y}
        width={CAP.w}
        height={CAP.h}
        rx={CAP.r}
        className={solid ? 'fill-jar-cap' : 'fill-ink/[0.06] stroke-ink/15'}
        strokeWidth={solid ? 0 : 0.8}
      />
      {solid && (
        <>
          <rect x={BODY.x} y={BODY.y} width={BODY.w} height={BODY.h} rx={BODY.r} fill={`url(#${sheenId})`} />
          <rect x={CAP.x} y={CAP.y} width={CAP.w} height={CAP.h} rx={CAP.r} fill={`url(#${sheenId})`} />
          <rect x={CAP.x} y={CAP.y + CAP.h - 3} width={CAP.w} height="3" className="fill-black/35" />
        </>
      )}

      {/* Natpis (pozicije i veličine iz rendera) */}
      <text x="81" y="86" textAnchor="middle" className={cn(text, 'text-[11px] font-medium tracking-[-0.02em]')}>
        NuroLab
      </text>
      <text x="82" y="135" textAnchor="middle" className={cn(text, 'text-[19px] font-light tracking-[0.1em]')}>
        ZENFLOW
      </text>
      <rect
        x="19"
        y="194"
        width="124"
        height="11"
        rx="5.5"
        fill="none"
        strokeWidth="0.7"
        className={solid ? 'stroke-paper/80' : 'stroke-ink/15'}
      />
      <text x="81" y="201.8" textAnchor="middle" className={cn(text, 'text-[5.6px] font-semibold tracking-[0.02em]')}>
        FOKUS • ENERGIJA • KONCENTRACIJA
      </text>
      <text x="81" y="216" textAnchor="middle" className={cn(text, 'text-[5.6px] opacity-85')}>
        60 kapsula | 100% veganski
      </text>
    </g>
  )
}
