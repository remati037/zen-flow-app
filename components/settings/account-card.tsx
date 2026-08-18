import { SignOutButton } from '@clerk/nextjs'
import { LogOut, PackagePlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AccessStatus } from '@/lib/access/status'

/** Labela + stil bedža po statusu pristupa (samo brand tokeni). */
const STATUS_META: Record<AccessStatus, { label: string; className: string }> = {
  vip: { label: 'VIP', className: 'bg-lime text-ink' },
  subscriber: { label: 'Pretplatnik', className: 'bg-lime-soft text-ink' },
  inactive: { label: 'Neaktivan', className: 'bg-muted text-slate-mid ring-1 ring-foreground/10' },
}

export function AccountCard({
  email,
  status,
  vipUntilLabel,
  refillUrl,
}: {
  email: string
  status: AccessStatus
  /** Datum isteka VIP-a ('14. jul 2026.'), ili `null` kad nema porudžbine (npr. admin). */
  vipUntilLabel: string | null
  refillUrl: string | null
}) {
  const meta = STATUS_META[status]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nalog</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-lg bg-muted/50 px-4 py-3">
          <p className="text-xs text-slate-soft">Mejl naloga</p>
          <p className="font-medium break-all text-ink">{email}</p>
          <p className="mt-1 text-xs text-slate-soft">
            Mejl dolazi iz tvog naloga i ne menja se ovde — po njemu se povezuju porudžbine.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm text-slate-mid">Status pristupa</span>
          <span
            className={`inline-flex h-6 items-center rounded-full px-3 text-xs font-medium ${meta.className}`}
          >
            {meta.label}
          </span>
          {status === 'vip' && vipUntilLabel && (
            <span className="text-sm text-slate-mid">
              VIP do <strong className="font-medium text-ink">{vipUntilLabel}</strong>
            </span>
          )}
        </div>

        {status === 'vip' && vipUntilLabel && (
          <p className="text-xs text-slate-soft">
            Pristup se produžava svakom novom porudžbinom — računa se 60 dana od poslednje.
          </p>
        )}

        {status === 'vip' && !vipUntilLabel && (
          <p className="text-xs text-slate-soft">Pristup je aktivan i nema datum isteka.</p>
        )}

        {status === 'inactive' && (
          <div className="space-y-3 rounded-lg bg-muted/50 px-4 py-3">
            <p className="text-sm text-slate-mid">
              Nemamo aktivnu porudžbinu za ovaj mejl, pa je pristup pauziran. Naruči dopunu da
              nastaviš protokol tamo gde si stao.
            </p>
            {refillUrl && (
              <Button variant="lime" size="lg" className="w-full sm:w-auto" asChild>
                <a href={refillUrl} target="_blank" rel="noopener noreferrer">
                  <PackagePlus className="size-4" />
                  Naruči dopunu
                </a>
              </Button>
            )}
          </div>
        )}

        <div className="border-t border-foreground/10 pt-4">
          <SignOutButton redirectUrl="/sign-in">
            <Button variant="ghost" size="lg" className="w-full rounded-full sm:w-auto">
              <LogOut className="size-4" />
              Odjavi se
            </Button>
          </SignOutButton>
        </div>
      </CardContent>
    </Card>
  )
}
