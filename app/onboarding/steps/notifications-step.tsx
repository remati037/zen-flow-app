'use client'

import { BellRing } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { IosInstallHint } from '@/components/push/ios-install-hint'
import { PushToggle } from '@/components/push/push-toggle'

import { StepHeading } from './step-heading'
import type { SupplyEstimate } from './types'

/**
 * Korak 4 — podsetnici + rekapitulacija, i jedina tačka sa kojom se šalje
 * `completeOnboarding`.
 *
 * Push ide kroz `PushToggle` iz 1.8 (pravi subscribe + perzistencija u DB), ne
 * kroz goli `Notification.requestPermission()` — inače bi cron dispatcher iz
 * 1.9 imao dozvolu bez pretplate i ne bi imao kome da šalje.
 */
export function NotificationsStep({
  estimate,
  doseMorningTime,
  doseEveningTime,
  isPending,
  error,
  onSubmit,
  onBack,
}: {
  estimate: SupplyEstimate
  doseMorningTime: string
  doseEveningTime: string
  isPending: boolean
  error: string | null
  onSubmit: () => void
  onBack: () => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHeading
        eyebrow="Korak 5 od 5"
        title="Podsetnici i kraj"
        description="Uključi podsetnike da niz ne pukne zbog zaboravljene doze."
      />

      <div className="flex flex-col gap-3 rounded-xl bg-paper p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lime text-ink">
            <BellRing className="size-4" />
          </span>
          <p className="text-sm leading-snug text-slate-mid">
            Podsetnik stiže u <strong className="text-ink">{doseMorningTime}</strong> i{' '}
            <strong className="text-ink">{doseEveningTime}</strong>, plus upozorenje kad zalihe padnu nisko.
          </p>
        </div>
        <IosInstallHint />
        <div className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-foreground/10">
          <PushToggle />
        </div>
      </div>

      <div className="rounded-xl bg-paper px-4 py-3 text-sm text-slate-mid">
        <p className="mb-1 font-heading text-sm font-medium text-ink">Rekapitulacija</p>
        <p>
          {estimate.packages} {estimate.packages === 1 ? 'pakovanje' : 'pakovanja'} · {estimate.capsules}{' '}
          kapsula · ≈ {estimate.days} dana
        </p>
        {estimate.runoutLabel && <p>Zalihe ističu oko {estimate.runoutLabel}</p>}
      </div>

      <p className="text-xs text-slate-soft">
        Sve ovo kasnije menjaš u Podešavanjima — podsetnike, termine i broj pakovanja.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onBack} disabled={isPending}>
          Nazad
        </Button>
        <Button
          type="button"
          variant="lime"
          size="lg"
          className="flex-1"
          onClick={onSubmit}
          disabled={isPending}
        >
          {isPending ? 'Čuvam…' : 'Završi onboarding'}
        </Button>
      </div>
    </div>
  )
}
