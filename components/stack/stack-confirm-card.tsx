'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { confirmStack } from '@/app/(app)/stack/actions'
import { Button } from '@/components/ui/button'

/**
 * Nedeljno pitanje „da li je stack isti". Ista komponenta stoji na `/stack` i na
 * dashboardu; na `/stack` `showEditLink` je isključen (lista je već ispod).
 */
export function StackConfirmCard({ showEditLink = true }: { showEditLink?: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      try {
        const result = await confirmStack({})
        if (result.ok) {
          toast.success('Stack potvrđen.')
          router.refresh()
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Nema veze. Pokušaj ponovo.')
      }
    })
  }

  return (
    <section className="rounded-[24px] bg-white p-5 ring-1 ring-ink/[0.06]">
      <h2 className="font-medium text-ink">Da li je stack i dalje isti?</h2>
      <p className="mt-1 text-sm text-slate-mid">Proveri da li još piješ sve što je na listi.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="lime" className="min-h-11 rounded-full px-5" onClick={confirm} disabled={isPending}>
          Isti je
        </Button>
        {showEditLink && (
          <Button asChild variant="outline" className="min-h-11 rounded-full px-5">
            <Link href="/stack">Izmeni</Link>
          </Button>
        )}
      </div>
    </section>
  )
}
