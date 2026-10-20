'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { HEALTH_CONSENT_DETAILS, HEALTH_CONSENT_STATEMENT, privacyPolicyUrl } from '@/lib/legal'

/**
 * Izričit pristanak za podatke o zdravlju: izjava, svrha i čekboks. Kontrolisana
 * komponenta — roditelj drži stanje i ne pušta dalje dok nije štiklirano.
 * Isti tekst ide u onboarding i na `/saglasnost` (vidi `lib/legal.ts`).
 */
export function HealthConsent({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const policyUrl = privacyPolicyUrl()

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2 rounded-lg bg-paper px-4 py-3 text-sm text-slate-mid">
        {HEALTH_CONSENT_DETAILS.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-slate-soft" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-1 py-2">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          className="mt-0.5 size-5"
          aria-describedby="health-consent-policy"
        />
        <span className="text-sm text-ink">{HEALTH_CONSENT_STATEMENT}</span>
      </label>

      <p id="health-consent-policy" className="text-xs text-slate-soft">
        {policyUrl ? (
          <>
            Detalji su u{' '}
            <a
              href={policyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ink underline underline-offset-2"
            >
              politici privatnosti
            </a>
            .
          </>
        ) : (
          'Detalji su u politici privatnosti na nurolab.rs.'
        )}
      </p>
    </div>
  )
}
