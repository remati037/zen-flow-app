'use client'

import { motion } from 'motion/react'

import { SPRING } from './motion'

/**
 * Gamifikovani progress bar wizarda (zamena za `ProgressDots` iz 1.4).
 * Lime traka koja se spring-om doteže do trenutne pozicije; procenat raste i
 * unutar kviza (pitanje po pitanje), pa napredak nikad ne stoji u mestu.
 */
export function OnboardingProgress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium tracking-wide text-slate-soft uppercase">{label}</span>
        <span className="text-[11px] font-medium text-slate-soft tabular-nums">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Napredak onboardinga"
        className="h-2 w-full overflow-hidden rounded-full bg-paper"
      >
        <motion.div
          className="h-full rounded-full bg-lime"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={SPRING}
        />
      </div>
    </div>
  )
}
