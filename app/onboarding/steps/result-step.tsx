'use client'

import { useEffect, useState } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { buildPlanHighlights, getFocusScoreBand } from '@/lib/quiz/focus-quiz'

import { SLIDE_TRANSITION } from './motion'
import { StepHeading } from './step-heading'

/* Geometrija polukruga: centar (104,104), r = 92, debljina 16. */
const ARC_PATH = 'M 12 104 A 92 92 0 0 1 196 104'

/**
 * Korak 3b — rezultat kviza.
 *
 * Gauge je jedan `motionValue` (0 → score) iz kog se izvode i ispis broja i
 * `pathLength` luka, pa se nikad ne raziđu; spring je bez odskoka da bi luk
 * stao tačno na skoru (pathLength > 1 bi se odsekao).
 */
export function ResultStep({
  score,
  answers,
  onNext,
  onBack,
}: {
  score: number
  answers: (number | null)[]
  onNext: () => void
  onBack: () => void
}) {
  const band = getFocusScoreBand(score)
  const highlights = buildPlanHighlights(answers)

  return (
    <div className="flex flex-col gap-5">
      <StepHeading
        eyebrow="Korak 3 od 5 · Rezultat"
        title="Tvoj startni Focus Score"
        description="Ovo je nulta tačka. Za 30 dana ponovo merimo i porediš razliku."
      />

      <FocusGauge score={score} bandLabel={band.label} />

      <p className="text-center text-sm leading-relaxed text-slate-mid">{band.summary}</p>

      <div className="flex flex-col gap-2 rounded-xl bg-paper p-4">
        <p className="font-heading text-sm font-medium text-ink">Tvoj 30-dnevni plan</p>
        <ul className="flex flex-col gap-2.5">
          {highlights.map((highlight, i) => (
            <motion.li
              key={highlight.key}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...SLIDE_TRANSITION, delay: 0.35 + i * 0.1 }}
              className="flex gap-2.5"
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-lime text-ink">
                <Check className="size-3" />
              </span>
              <span className="text-sm leading-snug text-slate-mid">
                <strong className="font-medium text-ink">{highlight.title}.</strong> {highlight.body}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onBack}>
          Nazad
        </Button>
        <Button type="button" variant="lime" size="lg" className="flex-1" onClick={onNext}>
          Dalje
        </Button>
      </div>
    </div>
  )
}

/** Polukružni SVG gauge — lime → ink sweep, spring bez odskoka. */
function FocusGauge({ score, bandLabel }: { score: number; bandLabel: string }) {
  const reducedMotion = useReducedMotion()
  const progress = useMotionValue(reducedMotion ? score : 0)
  const pathLength = useTransform(progress, (value) => value / 100)
  const [display, setDisplay] = useState(reducedMotion ? score : 0)

  useEffect(() => {
    const unsubscribe = progress.on('change', (value) => setDisplay(Math.round(value)))
    const controls = animate(
      progress,
      score,
      reducedMotion ? { duration: 0 } : { type: 'spring', duration: 1.2, bounce: 0 },
    )
    return () => {
      controls.stop()
      unsubscribe()
    }
  }, [progress, score, reducedMotion])

  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div className="relative">
        <svg viewBox="0 0 208 120" className="w-full" role="img" aria-label={`Focus Score ${score} od 100`}>
          <defs>
            <linearGradient id="zenflow-focus-gauge" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--color-lime)" />
              <stop offset="100%" stopColor="var(--color-ink)" />
            </linearGradient>
          </defs>

          <path
            d={ARC_PATH}
            fill="none"
            stroke="var(--color-paper)"
            strokeWidth={16}
            strokeLinecap="round"
          />
          <motion.path
            d={ARC_PATH}
            fill="none"
            stroke="url(#zenflow-focus-gauge)"
            strokeWidth={16}
            strokeLinecap="round"
            style={{ pathLength }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-end gap-0.5 pb-[3%]">
          <span className="font-heading text-4xl leading-none font-semibold text-ink tabular-nums">
            {display}
          </span>
          <span className="text-[11px] font-medium tracking-wide text-slate-soft uppercase">
            {bandLabel}
          </span>
        </div>
      </div>

      <div className="mt-1 flex justify-between px-1 text-[10px] font-medium text-slate-soft">
        <span>0</span>
        <span>100</span>
      </div>
    </div>
  )
}
