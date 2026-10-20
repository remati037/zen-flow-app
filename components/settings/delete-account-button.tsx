'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { deleteAccount } from '@/app/(app)/podesavanja/account-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * Trajno brisanje naloga u dva koraka (dugme → dijalog sa potvrdom). Posle brisanja
 * Clerk sesija više ne važi, pa se odjava radi i lokalno i ide se na prijavu.
 */
export function DeleteAccountButton({
  label = 'Obriši nalog',
  variant = 'destructive',
}: {
  label?: string
  variant?: 'destructive' | 'ghost'
}) {
  const { signOut } = useClerk()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      try {
        const result = await deleteAccount({ confirm: true })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
      } catch {
        // Bez mreže akcija baca umesto da vrati `{ ok: false }`.
        toast.error('Nema internet veze. Pokušaj ponovo.')
        return
      }
      try {
        await signOut({ redirectUrl: '/sign-in' })
      } catch {
        // Sesija je već poništena brisanjem korisnika; ostaje samo da odemo na prijavu.
        router.replace('/sign-in')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant={variant} size="lg" className="w-full rounded-full sm:w-auto">
          <Trash2 className="size-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>Obrisati nalog trajno?</DialogTitle>
          <DialogDescription>
            Brišu se nalog i svi podaci iz aplikacije: doze, niz, zalihe, kviz, fokus, bedževi,
            Moj stack i podsetnici. Ovo ne može da se vrati. Porudžbine ostaju u evidenciji
            prodavnice na nurolab.rs.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="lg" disabled={isPending} onClick={() => setOpen(false)}>
            Odustani
          </Button>
          <Button variant="destructive" size="lg" disabled={isPending} onClick={confirm}>
            {isPending ? 'Brišem…' : 'Da, obriši nalog'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
