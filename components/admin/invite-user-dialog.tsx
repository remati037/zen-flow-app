'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { inviteUser, type InviteResult } from '@/app/(admin)/admin/korisnici/actions'
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
import { ADMIN_INVITE_EXPIRES_DAYS } from '@/lib/invitations/rules'

/** Kopira link pozivnice — za slučaj da mejl ne stigne (Spam, pogrešan filter). */
export async function copyInviteLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Link kopiran.')
  } catch {
    toast.error('Kopiranje nije uspelo — browser ne dozvoljava pristup clipboard-u.')
  }
}

/**
 * „Pozovi korisnika" — pozivnica nezavisna od porudžbina. Osoba se registruje
 * preko linka i dobija trajan VIP override (vidi `inviteUser`).
 */
export function InviteUserDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InviteResult | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setEmail('')
      setError(null)
      setResult(null)
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await inviteUser({ email })
      if (!res.ok) {
        setError(res.fieldErrors?.email?.[0] ?? res.error)
        return
      }
      setResult(res.data)
      if (res.data.emailSent) toast.success(`Pozivnica poslata na ${res.data.email}.`)
      else toast.warning('Pozivnica je napravljena, ali mejl nije poslat — kopiraj link ručno.')
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="lime">
          <UserPlus /> Pozovi korisnika
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pozovi korisnika</DialogTitle>
          <DialogDescription>
            Osoba dobija link za registraciju i trajan VIP pristup, bez obzira na porudžbine. Link
            važi {ADMIN_INVITE_EXPIRES_DAYS} dana.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-mid">
              {result.emailSent ? (
                <>
                  Mejl je poslat na <span className="font-medium text-ink">{result.email}</span>.
                </>
              ) : (
                <>
                  Mejl <span className="font-medium text-destructive">nije poslat</span>
                  {result.emailError ? ` (${result.emailError})` : ''}. Pozivnica važi — pošalji
                  link ručno.
                </>
              )}
            </p>
            {result.url && (
              <Button variant="outline" size="sm" onClick={() => copyInviteLink(result.url!)}>
                <Copy /> Kopiraj link pozivnice
              </Button>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResult(null)}>
                Pozovi još nekog
              </Button>
              <Button variant="dark" onClick={() => reset(false)}>
                Gotovo
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Mejl</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? true : undefined}
                placeholder="ime@primer.rs"
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="dark" disabled={isPending || !email.trim()}>
                {isPending ? 'Šaljem…' : 'Pošalji pozivnicu'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
