'use client'

import { HealthConsent } from '@/components/legal/health-consent'
import { Button } from '@/components/ui/button'

import { StepHeading } from './step-heading'

/**
 * Korak 3: pristanak za podatke o zdravlju, PRE kviza — kviz je prvi takav podatak
 * koji korisnik unosi. „Dalje" je zaključano dok nije štiklirano; server ga ionako
 * traži (`completeOnboardingSchema.healthConsent`).
 */
export function ConsentStep({
  consent,
  onConsentChange,
  onNext,
  onBack,
}: {
  consent: boolean
  onConsentChange: (value: boolean) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeading
        eyebrow="Korak 3 od 5"
        title="Tvoji podaci"
        description="Aplikacija beleži doze, zalihe i kako se osećaš. To su podaci o zdravlju, pa nam treba tvoja saglasnost."
      />

      <HealthConsent checked={consent} onCheckedChange={onConsentChange} />

      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onBack}>
          Nazad
        </Button>
        <Button
          type="button"
          variant="lime"
          size="lg"
          className="flex-1"
          disabled={!consent}
          onClick={onNext}
        >
          Dalje
        </Button>
      </div>
    </div>
  )
}
