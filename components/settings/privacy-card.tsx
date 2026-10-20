import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DeleteAccountButton } from '@/components/settings/delete-account-button'
import { formatIsoDateSr, toBelgradeIso } from '@/lib/dates'
import { privacyPolicyUrl } from '@/lib/legal'

/**
 * Privatnost: kad je dat pristanak, link ka politici i brisanje naloga. Povlačenje
 * pristanka = brisanje naloga (vidi `lib/legal.ts`), pa je ovde jedno dugme, ne dva.
 */
export function PrivacyCard({ consentAt }: { consentAt: Date | null }) {
  const policyUrl = privacyPolicyUrl()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Privatnost</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-mid">
          {consentAt
            ? `Saglasnost za obradu podataka o zdravlju je data ${formatIsoDateSr(toBelgradeIso(consentAt))}.`
            : 'Saglasnost za obradu podataka o zdravlju još nije data.'}{' '}
          Povlači se brisanjem naloga.
        </p>

        {policyUrl && (
          <a
            href={policyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-sm font-medium text-ink underline underline-offset-2"
          >
            Politika privatnosti
          </a>
        )}

        <div className="border-t border-foreground/10 pt-4">
          <DeleteAccountButton />
        </div>
      </CardContent>
    </Card>
  )
}
