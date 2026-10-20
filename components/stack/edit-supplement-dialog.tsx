'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { updateSupplement } from '@/app/(app)/stack/actions'
import { TimeOfDayPicker } from '@/components/stack/time-of-day-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supplementDisplayName } from '@/lib/supplements/catalog'
import type { TimeOfDay } from '@/lib/supplements/time-of-day'
import type { StackRow } from '@/lib/supplements/types'

export function EditSupplementDialog({ row }: { row: StackRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(row.timeOfDay)
  const [doseNote, setDoseNote] = useState(row.doseNote ?? '')
  const name = supplementDisplayName(row.catalogKey, row.customName)

  function save() {
    startTransition(async () => {
      try {
        const result = await updateSupplement({ id: row.id, timeOfDay, doseNote })
        if (result.ok) {
          toast.success('Sačuvano.')
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setTimeOfDay(row.timeOfDay)
          setDoseNote(row.doseNote ?? '')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="size-11 shrink-0 rounded-full p-0 text-slate-mid"
          aria-label={`Izmeni: ${name}`}
        >
          <Pencil aria-hidden className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>Kad ga piješ i u kojoj dozi?</DialogDescription>
        </DialogHeader>
        <TimeOfDayPicker value={timeOfDay} onChange={setTimeOfDay} />
        <div className="space-y-1.5">
          <Label htmlFor={`dose-${row.id}`}>Doza (opciono)</Label>
          <Input
            id={`dose-${row.id}`}
            value={doseNote}
            onChange={(e) => setDoseNote(e.target.value)}
            maxLength={40}
            className="min-h-11"
          />
        </div>
        <Button variant="lime" className="min-h-11 rounded-full" onClick={save} disabled={isPending}>
          Sačuvaj
        </Button>
      </DialogContent>
    </Dialog>
  )
}
