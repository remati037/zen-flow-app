'use client'

import { useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * „Proveri ponovo" na `/nemas-pristup`.
 *
 * Zašto postoji: stranica pri svakom renderu zove `refreshAccessStatusForProfile`
 * i sama preusmerava u app čim porudžbina stigne — ali u standalone PWA režimu
 * korisnik nema ni adresnu traku ni pull-to-refresh, pa nema NAČIN da izazove taj
 * render. Bez ovog dugmeta kupac koji je upravo poručio ostaje zaglavljen na
 * ekranu koji mu kaže da osveži stranicu, a ne može.
 *
 * `router.refresh()` ponovo izvrši server komponentu; ako je status prešao u
 * `vip`, redirect iz page-a odradi ostalo i ova komponenta se odmontira. Ako
 * ostanemo ovde, znači da porudžbine i dalje nema — pa to i kažemo, umesto da
 * dugme naizgled ne uradi ništa.
 */
export function RecheckAccessButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const wasPending = useRef(false)

  useEffect(() => {
    // Prelaz pending → mirno stanje bez redirect-a = i dalje nema pristupa.
    if (wasPending.current && !isPending) {
      toast('Još uvek ne vidimo porudžbinu na ovom mejlu.')
    }
    wasPending.current = isPending
  }, [isPending])

  return (
    <Button
      variant="dark"
      size="lg"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw className={cn('size-4', isPending && 'animate-spin')} />
      {isPending ? 'Proveravam…' : 'Proveri ponovo'}
    </Button>
  )
}
