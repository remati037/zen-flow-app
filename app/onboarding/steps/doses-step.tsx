'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { StepHeading } from './step-heading'

/**
 * Korak 2 — termini jutarnje i večernje doze. Cron dispatcher (1.9) šalje
 * podsetnike tačno po ovim vremenima, pa su ona deo protokola, ne kozmetika.
 */
export function DosesStep({
  doseMorningTime,
  doseEveningTime,
  onMorningChange,
  onEveningChange,
  onNext,
  onBack,
}: {
  doseMorningTime: string
  doseEveningTime: string
  onMorningChange: (value: string) => void
  onEveningChange: (value: string) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeading
        eyebrow="Korak 2 od 5"
        title="Vreme doza"
        description="Kad uzimaš jutarnju i večernju dozu? Po ovome ti stižu podsetnici."
      />

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Jutarnja doza</span>
          <Input type="time" value={doseMorningTime} onChange={(e) => onMorningChange(e.target.value)} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Večernja doza</span>
          <Input type="time" value={doseEveningTime} onChange={(e) => onEveningChange(e.target.value)} />
        </label>

        <p className="rounded-lg bg-paper px-4 py-3 text-sm text-slate-mid">
          Isti termin svakog dana je pola posla — protokol se gradi ritmom. Vremena kasnije menjaš u
          Podešavanjima.
        </p>
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
