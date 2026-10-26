'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { clearStack } from '@/app/(app)/stack/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function ClearStackButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  function clear() {
    startTransition(async () => {
      try {
        const result = await clearStack({})
        if (result.ok) {
          toast.success('Lista suplemenata je obrisana.')
          setOpen(false)
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="min-h-11 rounded-full px-4 text-sm text-slate-mid">
          Obriši celu listu
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Obrisati celu listu?</DialogTitle>
          <DialogDescription>
            Svi uneti suplementi se trajno brišu. Ovo ne utiče na tvoj ZenFlow protokol.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-11 flex-1 rounded-full" onClick={() => setOpen(false)}>
            Odustani
          </Button>
          <Button variant="dark" className="min-h-11 flex-1 rounded-full" onClick={clear} disabled={isPending}>
            Obriši
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
