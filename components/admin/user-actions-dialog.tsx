'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Mail, ShieldCheck, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'

import {
  resendWelcomeEmail,
  setUserAccessStatus,
} from '@/app/(admin)/admin/korisnici/actions'
import { AccessStatusBadge } from '@/components/admin/access-status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import type { AdminUserRow } from '@/lib/admin/users'
import { formatIsoDateSr, toBelgradeIso } from '@/lib/dates'

/**
 * Row akcije nad jednim nalogom: ručni access override i ponovno slanje welcome
 * mejla. Obe akcije idu kroz `createAction(..., { admin: true })` — klijent nikad
 * ne dira bazu direktno.
 */
export function UserActionsDialog({ user }: { user: AdminUserRow }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function applyStatus(status: 'vip' | 'inactive') {
    startTransition(async () => {
      const result = await setUserAccessStatus({ userId: user.id, status })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (!result.data.applied) {
        toast.error('Korisnik više ne postoji u bazi.')
        return
      }
      if (result.data.willRevertOnCron) {
        toast.warning(
          `Status je postavljen na VIP, ali bez porudžbine u prozoru — noćni cron ga vraća na "neaktivan".`,
        )
      } else {
        toast.success(`Status promenjen na ${status === 'vip' ? 'VIP' : 'neaktivan'}.`)
      }
      router.refresh()
    })
  }

  function resendWelcome() {
    startTransition(async () => {
      const result = await resendWelcomeEmail({ userId: user.id })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.data.sent) {
        toast.success(`Welcome mejl poslat na ${result.data.email}.`)
        router.refresh()
      } else if (result.data.reason === 'not-found') {
        toast.error('Korisnik više ne postoji u bazi.')
      } else {
        toast.error(`Slanje nije uspelo: ${result.data.error ?? 'nepoznata greška'}`)
      }
    })
  }

  const orderLabel = user.latestOrderDate
    ? formatIsoDateSr(toBelgradeIso(user.latestOrderDate))
    : null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Upravljaj
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-all">{user.email}</DialogTitle>
          <DialogDescription>
            {user.name ?? 'Bez imena'} · {user.role === 'admin' ? 'admin' : 'korisnik'} · streak{' '}
            {user.streak}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-ink">Pristup</p>
              <AccessStatusBadge status={user.accessStatus} />
            </div>
            <p className="text-xs text-slate-mid">
              {orderLabel
                ? `Poslednja porudžbina: ${orderLabel}${user.hasOrderInVipWindow ? ' (u VIP prozoru)' : ' (van VIP prozora)'}.`
                : 'Nema nijednu porudžbinu u bazi.'}
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="lime"
                size="sm"
                onClick={() => applyStatus('vip')}
                disabled={isPending || user.accessStatus === 'vip'}
              >
                <ShieldCheck /> Postavi VIP
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyStatus('inactive')}
                disabled={isPending || user.accessStatus === 'inactive'}
              >
                <ShieldOff /> Postavi neaktivan
              </Button>
            </div>
          </div>

          <div className="flex gap-2.5 rounded-lg bg-paper p-3 text-xs text-slate-mid">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-soft" />
            <p>
              <span className="font-medium text-ink">Kako override živi uz cron:</span> ručno
              postavljen <span className="font-medium">VIP</span> bez porudžbine u poslednjih 60 dana
              noćni cron (<code className="text-[0.95em]">maintainAccessStatuses</code>) vraća na{' '}
              <span className="font-medium">neaktivan</span>. U MVP-u je to dokumentovano ponašanje —
              nema kolone za trajni override, pa se šema ne menja. Za trajan pristup korisniku treba
              porudžbina u bazi (ili admin rola u Clerk-u).
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Mejl</p>
            <p className="text-xs text-slate-mid">
              Ponovo šalje welcome mejl (isti šablon kao pri registraciji) i upisuje red u{' '}
              <code className="text-[0.95em]">notifications_log</code>.
            </p>
            <Button variant="outline" size="sm" onClick={resendWelcome} disabled={isPending}>
              <Mail /> {isPending ? 'Radim…' : 'Pošalji welcome mejl ponovo'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
