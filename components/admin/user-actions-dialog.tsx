'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Mail, RotateCcw, ShieldCheck, ShieldOff } from 'lucide-react'
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
import type { AccessOverrideChoice } from '@/lib/validations/admin'

/**
 * Row akcije nad jednim nalogom: ručni access override i ponovno slanje welcome
 * mejla. Obe akcije idu kroz `createAction(..., { admin: true })` — klijent nikad
 * ne dira bazu direktno.
 */
export function UserActionsDialog({ user }: { user: AdminUserRow }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function applyStatus(choice: AccessOverrideChoice) {
    startTransition(async () => {
      const result = await setUserAccessStatus({ userId: user.id, status: choice })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (!result.data.applied) {
        toast.error('Korisnik više ne postoji u bazi.')
        return
      }

      const { override, status, hasOrderInWindow, roleOverridesChoice } = result.data

      if (roleOverridesChoice) {
        // Rola je izvor istine i za middleware; `resolveAccessStatus` admina uvek
        // svodi na `vip`. Bez ove poruke admin misli da je nalog blokirao.
        toast.warning(
          'Nalog ima admin rolu, pa ostaje VIP bez obzira na override. Skini mu rolu u Clerk-u da bi blokada imala efekta.',
        )
      } else if (override === null) {
        toast.success(
          hasOrderInWindow
            ? 'Override skinut — nalog je pod automatikom i ima porudžbinu u prozoru (VIP).'
            : 'Override skinut — nalog je pod automatikom i bez porudžbine u prozoru (neaktivan).',
        )
      } else {
        toast.success(
          `Override postavljen: ${override === 'vip' ? 'VIP' : 'neaktivan'}. Ostaje dok ga ne skineš — ni cron ni korisnikov refresh ga ne menjaju.`,
        )
      }

      // Efektivni status se prikazuje odmah; lista se osvežava iz baze.
      if (status !== override && override !== null && !roleOverridesChoice) {
        toast.message(`Efektivni status: ${status}.`)
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

  const overrideLabel = user.accessOverride
    ? user.accessOverride === 'vip'
      ? 'VIP (ručno)'
      : 'Neaktivan (ručno)'
    : null

  const overrideAtLabel = user.accessOverrideAt
    ? formatIsoDateSr(toBelgradeIso(user.accessOverrideAt))
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
              {overrideLabel && (
                <span className="inline-flex h-6 items-center rounded-full bg-muted px-3 text-xs font-medium text-slate-mid ring-1 ring-foreground/10">
                  {overrideLabel}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-mid">
              {orderLabel
                ? `Poslednja porudžbina: ${orderLabel}${user.hasOrderInVipWindow ? ' (u VIP prozoru)' : ' (van VIP prozora)'}.`
                : 'Nema nijednu porudžbinu u bazi.'}
            </p>
            {overrideLabel && (
              <p className="text-xs text-slate-mid">
                Override postavljen{overrideAtLabel ? ` ${overrideAtLabel}` : ''}
                {user.accessOverrideBy ? ` (admin ${user.accessOverrideBy.slice(-6)})` : ''}. Dok
                stoji, porudžbine se ne pitaju.
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="lime"
                size="sm"
                onClick={() => applyStatus('vip')}
                disabled={isPending || user.accessOverride === 'vip'}
              >
                <ShieldCheck /> Override: VIP
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyStatus('inactive')}
                disabled={isPending || user.accessOverride === 'inactive'}
              >
                <ShieldOff /> Override: neaktivan
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyStatus('auto')}
                disabled={isPending || user.accessOverride === null}
              >
                <RotateCcw /> Vrati automatiku
              </Button>
            </div>
          </div>

          <div className="flex gap-2.5 rounded-lg bg-paper p-3 text-xs text-slate-mid">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-soft" />
            <p>
              <span className="font-medium text-ink">Kako override radi:</span> upisuje se u{' '}
              <code className="text-[0.95em]">access_override</code>, zasebnu kolonu koju poštuju i
              gejt pristupa i noćni cron. <span className="font-medium">Trajan je</span> — ne gasi ga
              ni korisnikov refresh ni <code className="text-[0.95em]">maintainAccessStatuses</code>,
              samo dugme „Vrati automatiku&ldquo;. Bez override-a pristup zavisi isključivo od
              porudžbine u poslednjih 60 dana. Nalog sa{' '}
              <span className="font-medium">admin rolom</span> je uvek VIP — njemu override na
              „neaktivan&ldquo; nema efekta dok mu se rola ne skine u Clerk-u.
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
