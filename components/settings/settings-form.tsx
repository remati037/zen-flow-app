'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'

import { updateSettings } from '@/app/(app)/podesavanja/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** 'HH:mm:ss' (Postgres time) → 'HH:mm'; null → ''. */
function toHm(time: string | null): string {
  return time ? time.slice(0, 5) : ''
}

export function SettingsForm({
  initialName,
  initialMorningTime,
  initialEveningTime,
}: {
  initialName: string | null
  initialMorningTime: string | null
  initialEveningTime: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(initialName ?? '')
  const [morning, setMorning] = useState(toHm(initialMorningTime))
  const [evening, setEvening] = useState(toHm(initialEveningTime))

  function submit() {
    if (!name.trim()) {
      toast.error('Unesi ime.')
      return
    }
    if (!morning || !evening) {
      toast.error('Postavi vreme za obe doze.')
      return
    }
    startTransition(async () => {
      const result = await updateSettings({
        name: name.trim(),
        doseMorningTime: morning,
        doseEveningTime: evening,
      })
      if (result.ok) {
        toast.success('Podešavanja sačuvana.')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="settings-name">Ime</Label>
        <Input
          id="settings-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="Tvoje ime"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="settings-morning" className="flex items-center gap-1.5">
            <Sun className="size-4 text-slate-mid" />
            Jutarnja doza
          </Label>
          <Input
            id="settings-morning"
            type="time"
            value={morning}
            onChange={(e) => setMorning(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-evening" className="flex items-center gap-1.5">
            <Moon className="size-4 text-slate-mid" />
            Večernja doza
          </Label>
          <Input
            id="settings-evening"
            type="time"
            value={evening}
            onChange={(e) => setEvening(e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs text-slate-soft">
        Vremena doza određuju kad ti stižu podsetnici i računaju se u tvoj protokol.
      </p>

      <Button variant="dark" onClick={submit} disabled={isPending} className="w-full sm:w-auto">
        Sačuvaj
      </Button>
    </div>
  )
}
