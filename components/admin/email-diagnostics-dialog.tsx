'use client'

import { useState, useTransition } from 'react'
import { CircleAlert, CircleCheck, CircleX, Stethoscope } from 'lucide-react'

import { diagnoseEmail } from '@/app/(admin)/admin/korisnici/actions'
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
import { Separator } from '@/components/ui/separator'
import type { SignUpDiagnosis } from '@/lib/admin/signup-diagnostics'
import { BELGRADE_TZ } from '@/lib/dates'

type Tone = 'ok' | 'warn' | 'bad'

const dateTime = new Intl.DateTimeFormat('sr-Latn-RS', {
  timeZone: BELGRADE_TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function Row({ tone, title, children }: { tone: Tone; title: string; children?: React.ReactNode }) {
  const Icon = tone === 'ok' ? CircleCheck : tone === 'warn' ? CircleAlert : CircleX
  const color = tone === 'ok' ? 'text-ink' : tone === 'warn' ? 'text-slate-mid' : 'text-destructive'
  return (
    <div className="flex gap-2.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-medium text-ink">{title}</p>
        {children && <div className="text-xs break-words text-slate-mid">{children}</div>}
      </div>
    </div>
  )
}

/** Presuda na vrhu — odgovor na pitanje „zašto nije stigao link". */
function Verdict({ d }: { d: SignUpDiagnosis }) {
  if (!d.decision) {
    return (
      <Row tone="bad" title="Ne može da se utvrdi — Clerk nije odgovorio">
        {d.pending.ok ? null : d.pending.error}
      </Row>
    )
  }
  if (d.decision.action === 'send') {
    const resendOk = d.config.resendDomain.ok && d.config.resendDomain.value?.status === 'verified'
    return (
      <Row tone={resendOk ? 'ok' : 'warn'} title="Forma bi sada POSLALA link">
        {resendOk
          ? 'Mejl je kupac, nema nalog ni svež link. Ako link ipak ne stiže, proveri Spam i Resend → Emails.'
          : 'Pravila su ispunjena, ali proveri Resend domen ispod — tu je najverovatniji kvar.'}
      </Row>
    )
  }
  switch (d.decision.reason) {
    case 'account_exists':
      return (
        <Row tone="warn" title="Preskočeno: nalog već postoji">
          Link se ne šalje postojećim nalozima. Osoba treba da se prijavi na /sign-in.
        </Row>
      )
    case 'not_a_buyer':
      return (
        <Row tone="warn" title="Preskočeno: mejl nije u bazi kupaca">
          Nema nijednu porudžbinu u statusu processing/completed sa ovim mejlom. Ako je kupio
          drugim mejlom, neka koristi taj — ili ga pozovi dugmetom „Pozovi korisnika&ldquo;.
        </Row>
      )
    case 'cooldown':
      return (
        <Row tone="warn" title={`Preskočeno: link je upravo poslat (još ~${d.decision.retryInMin} min)`}>
          Isti mejl dobija najviše jedan link na 10 minuta. Admin „Pošalji ponovo&ldquo; u listi
          pozivnica ne podleže ovom ograničenju.
        </Row>
      )
  }
}

function Report({ d }: { d: SignUpDiagnosis }) {
  const profileMissing = d.clerkUser.ok && d.clerkUser.value.exists && !d.account
  const resend = d.config.resendDomain

  return (
    <div className="space-y-4">
      <Verdict d={d} />
      <Separator />

      <div className="space-y-3">
        <p className="text-xs font-medium tracking-wide text-slate-soft uppercase">Nalog</p>
        {d.account ? (
          <Row tone="warn" title="Profil postoji u bazi">
            {d.account.role === 'admin' ? 'admin' : 'korisnik'} · pristup: {d.account.accessStatus}
          </Row>
        ) : (
          <Row tone="ok" title="Nema profila u bazi" />
        )}
        {!d.clerkUser.ok ? (
          <Row tone="bad" title="Clerk korisnici: provera nije uspela">{d.clerkUser.error}</Row>
        ) : profileMissing ? (
          <Row tone="bad" title="Clerk nalog postoji, a profil NE">
            `user.created` webhook nije stigao do aplikacije — proveri Clerk → Webhooks (endpoint
            /api/webhooks/clerk i signing secret).
          </Row>
        ) : (
          <Row tone="ok" title={d.clerkUser.value.exists ? 'Clerk nalog postoji' : 'Nema Clerk naloga'} />
        )}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium tracking-wide text-slate-soft uppercase">Porudžbine</p>
        {d.orders.length === 0 ? (
          <Row tone="warn" title="Nijedna porudžbina sa ovim mejlom">
            Ako je kupio, proveri da li je porudžbina ušla u /admin/porudzbine (Woo webhook ili
            backfill).
          </Row>
        ) : (
          d.orders.map((o) => (
            <Row
              key={o.status}
              tone={o.grantsAccess ? 'ok' : 'warn'}
              title={`${o.status} × ${o.count}${o.grantsAccess ? '' : ' (ne računa se)'}`}
            >
              poslednja: {dateTime.format(new Date(o.latest))}
            </Row>
          ))
        )}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium tracking-wide text-slate-soft uppercase">Pozivnice</p>
        {!d.pending.ok ? (
          <Row tone="bad" title="Clerk pozivnice: provera nije uspela">{d.pending.error}</Row>
        ) : d.pending.value.length === 0 ? (
          <Row tone="ok" title="Nema aktivne pozivnice" />
        ) : (
          d.pending.value.map((inv) => (
            <Row
              key={inv.id}
              tone="ok"
              title={`Aktivna pozivnica (${inv.kind === 'buyer' ? 'kupac' : 'admin · VIP'})`}
            >
              poslata {dateTime.format(new Date(inv.createdAt))}
            </Row>
          ))
        )}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium tracking-wide text-slate-soft uppercase">
          Konfiguracija ovog okruženja
        </p>
        {!resend.ok ? (
          <Row tone="warn" title="Resend domen: provera nije uspela">
            {resend.error}. (Ključ sa samo „Sending access&ldquo; dozvolom ne sme da čita domene — proveri
            ručno u Resend → Domains.)
          </Row>
        ) : !resend.value ? (
          <Row tone="bad" title={`Resend: domen ${d.config.senderDomain ?? '?'} NIJE dodat`}>
            Pošiljalac je {d.config.emailFrom}. Resend verifikuje tačan domen — verifikovan
            nurolab.rs ne pokriva app.nurolab.rs. Dodaj ga u Resend → Domains ili promeni
            EMAIL_FROM.
          </Row>
        ) : (
          <Row
            tone={resend.value.status === 'verified' ? 'ok' : 'bad'}
            title={`Resend: ${resend.value.name} — ${resend.value.status}`}
          >
            Pošiljalac: {d.config.emailFrom}
          </Row>
        )}
        <Row
          tone={d.config.appUrlLooksProduction ? 'ok' : 'bad'}
          title={`Link u pozivnici vodi na ${d.config.appUrl}/sign-up`}
        >
          {d.config.appUrlLooksProduction
            ? null
            : 'Ovo nije produkcijska adresa — postavi NEXT_PUBLIC_APP_URL na https://app.nurolab.rs i redeploy-uj.'}
        </Row>
        {!d.config.clerkSignUpMode.ok ? (
          <Row tone="warn" title={`Clerk (${d.config.clerkInstance}): sign-up mod nije mogao da se pročita`}>
            {d.config.clerkSignUpMode.error}
          </Row>
        ) : d.config.clerkSignUpMode.value === 'restricted' ? (
          <Row tone="ok" title={`Clerk (${d.config.clerkInstance}): sign-up mod restricted`}>
            Registracija je moguća samo preko pozivnice.
          </Row>
        ) : (
          <Row
            tone="bad"
            title={`Clerk (${d.config.clerkInstance}): sign-up mod ${d.config.clerkSignUpMode.value}`}
          >
            Registracija NIJE zaključana — ko otvori Clerk formu, može da napravi nalog i bez
            pozivnice. Clerk Dashboard → Configure → Restrictions → Sign-up mode: Restricted.
          </Row>
        )}
      </div>
    </div>
  )
}

/**
 * „Proveri mejl" — razdvaja uzroke koje javna forma namerno krije (nalog
 * postoji / nije kupac / cooldown) od kvarova (Clerk, Resend, URL). Samo čita.
 */
export function EmailDiagnosticsDialog() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<SignUpDiagnosis | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await diagnoseEmail({ email })
      if (!res.ok) {
        setReport(null)
        setError(res.fieldErrors?.email?.[0] ?? res.error)
        return
      }
      setReport(res.data)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setReport(null)
          setError(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Stethoscope /> Proveri mejl
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Proveri mejl</DialogTitle>
          <DialogDescription>
            Zašto link za registraciju (ne) stiže. Samo čita — ništa ne šalje i ne pravi pozivnicu.
            Vidi bazu i podešavanja okruženja u kom ga otvaraš.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex gap-2" noValidate>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="diag-email" className="sr-only">
              Mejl
            </Label>
            <Input
              id="diag-email"
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
          <Button type="submit" variant="dark" disabled={isPending || !email.trim()}>
            {isPending ? 'Proveravam…' : 'Proveri'}
          </Button>
        </form>

        {report && <Report d={report} />}
      </DialogContent>
    </Dialog>
  )
}
