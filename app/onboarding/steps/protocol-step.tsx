'use client'

import { motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addDaysIso, belgradeToday } from '@/lib/dates'
import { MAX_START_BACKDATE_DAYS } from '@/lib/validations/onboarding'

import { SLIDE_TRANSITION } from './motion'
import { StepHeading } from './step-heading'
import type { SupplyEstimate } from './types'

/**
 * Korak 1 — broj pakovanja i datum početka. Procena zaliha se osvežava uživo
 * (računa je wizard), pa korisnik odmah vidi posledicu unosa.
 */
export function ProtocolStep({
  packages,
  startDate,
  estimate,
  onPackagesChange,
  onStartDateChange,
  onNext,
  onBack,
}: {
  packages: string
  startDate: string
  estimate: SupplyEstimate
  onPackagesChange: (value: string) => void
  onStartDateChange: (value: string) => void
  onNext: () => void
  onBack: () => void
}) {
  // Ista granica kao u `completeOnboardingSchema` — picker ni ne nudi datum
  // koji bi server odbio.
  const today = belgradeToday()
  const earliestStart = addDaysIso(today, -MAX_START_BACKDATE_DAYS)

  return (
    <div className="flex flex-col gap-5">
      <StepHeading
        eyebrow="Korak 1 od 5"
        title="Postavi svoj protokol"
        description="Koliko pakovanja imaš i kad počinješ — po tome računamo kada ti ističu zalihe."
      />

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Broj pakovanja</span>
          <Input
            type="number"
            min={1}
            max={20}
            inputMode="numeric"
            value={packages}
            onChange={(e) => onPackagesChange(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Datum početka</span>
          <Input
            type="date"
            min={earliestStart}
            max={today}
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </label>

        <motion.div
          key={`${estimate.capsules}-${estimate.runoutLabel}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SLIDE_TRANSITION}
          className="rounded-lg bg-paper px-4 py-3 text-sm text-slate-mid"
        >
          <p>
            {estimate.capsules} kapsula · ≈ <strong className="text-ink">{estimate.days} dana</strong>
          </p>
          {estimate.runoutLabel && (
            <p>
              Zalihe ističu oko <strong className="text-ink">{estimate.runoutLabel}</strong>
            </p>
          )}
        </motion.div>
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
