import { SignOutButton } from '@clerk/nextjs'
import { redirect } from 'next/navigation'

import { RecheckAccessButton } from '@/components/access/recheck-access-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getLatestOrderDate, refreshAccessStatusForProfile } from '@/lib/access/status'
import { accessWindowEnd } from '@/lib/access/window'
import { getCurrentProfile, isAdmin } from '@/lib/auth'
import { formatIsoDateSr, toBelgradeIso } from '@/lib/dates'
import { danaLabel } from '@/lib/protocol/milestones'
import { getProtocolState } from '@/lib/protocol/queries'
import { refillUrl } from '@/lib/refill'

export const metadata = {
  title: 'Nemaš pristup · NuroLab',
}

/**
 * Ekran za korisnika bez važeće porudžbine (access_status = inactive).
 * Van (app)/(auth) grupa da ne uđe u petlju gejtovanja; middleware ga štiti (auth.protect).
 *
 * Re-evaluira status pri svakom otvaranju — ako je korisnik u međuvremenu kupio i porudžbina
 * je ušla preko WooCommerce webhook-a, osvežavanje stranice ga automatski vodi u app.
 */
export default async function NemasPristupPage() {
  const profile = await getCurrentProfile()
  if (!profile) {
    redirect('/sign-in')
  }

  const authoritativeRole = (await isAdmin()) ? 'admin' : 'user'
  const status = await refreshAccessStatusForProfile(profile, authoritativeRole)
  if (status !== 'inactive') {
    redirect('/dashboard')
  }

  const storeUrl = process.env.WOO_STORE_URL ?? 'https://nurolab.rs'
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'podrska@nurolab.rs'

  // Povratni kupac (ima važeću porudžbinu, ali van prozora) ≠ nalog bez kupovine.
  // „Nismo pronašli porudžbinu" je povratnom kupcu bilo netačno — i propuštena
  // prilika: ovo je trenutak kad je ponovna kupovina najverovatnija. Ručni
  // override (admin namerno ugasio pristup) dobija neutralni ekran.
  const latestOrder = profile.accessOverride ? null : await getLatestOrderDate(profile.email)
  if (latestOrder) {
    const expiredOn = formatIsoDateSr(accessWindowEnd(toBelgradeIso(latestOrder)))
    const { streak } = await getProtocolState(profile)
    return (
      <LapsedScreen
        email={profile.email}
        expiredOn={expiredOn}
        pausedStreak={streak.current}
        ctaHref={refillUrl('nemas_pristup') ?? storeUrl}
        supportEmail={supportEmail}
      />
    )
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <Card className="w-full max-w-md shadow-soft" size="default">
        <CardHeader>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            ZenFlow pristup
          </p>
          <CardTitle className="text-lg">Nalog još nema pristup</CardTitle>
          <CardDescription>
            Aplikacija je za ZenFlow kupce. Za ovaj nalog nismo pronašli nijednu
            porudžbinu.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="rounded-lg bg-muted/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">Registrovan mejl</p>
            <p className="font-medium break-all text-foreground">{profile.email}</p>
          </div>

          <p className="text-sm text-muted-foreground">
            Registruj se <strong className="text-foreground">istim mejlom kao pri kupovini</strong>{' '}
            na nurolab.rs. Posle porudžbine pristup se aktivira za par minuta. Tada klikni
            „Proveri ponovo&ldquo;.
          </p>

          <div className="flex flex-col gap-2">
            <Button asChild variant="lime" size="lg">
              <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                Kupi ZenFlow
              </a>
            </Button>

            {/* Standalone PWA nema ni adresnu traku ni pull-to-refresh — bez ovoga
                kupac koji je upravo poručio nema kako da ponovo pokrene proveru. */}
            <RecheckAccessButton />

            <Button asChild variant="outline" size="lg">
              <a href={`mailto:${supportEmail}`}>Kontaktiraj podršku</a>
            </Button>

            <SignOutButton redirectUrl="/sign-in">
              <Button variant="ghost" size="lg">
                Odjavi se / promeni nalog
              </Button>
            </SignOutButton>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

/** Kupac kome je istekao pristup: niz je pauziran, ne izgubljen — CTA vodi na dopunu. */
function LapsedScreen({
  email,
  expiredOn,
  pausedStreak,
  ctaHref,
  supportEmail,
}: {
  email: string
  expiredOn: string
  pausedStreak: number
  ctaHref: string
  supportEmail: string
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <Card className="w-full max-w-md shadow-soft" size="default">
        <CardHeader>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            ZenFlow pristup
          </p>
          <CardTitle className="text-lg">Tvoj protokol je pauziran</CardTitle>
          <CardDescription>
            Pristup je istekao {expiredOn}, jer je od poslednje porudžbine prošlo više od 60 dana.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {pausedStreak > 0 && (
            <div className="rounded-lg bg-ink px-4 py-3 text-paper">
              <p className="text-xs text-paper/70">Tvoj niz</p>
              <p className="font-heading text-2xl font-semibold text-lime">
                {pausedStreak} {danaLabel(pausedStreak)}
              </p>
              <p className="text-xs text-paper/70">Sačuvan je i čeka te.</p>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Istorija i niz čekaju tačno tamo gde su stali. Čim stigne nova porudžbina na{' '}
            <span className="font-medium text-foreground break-all">{email}</span>, pristup se
            vraća sam. Par minuta posle kupovine klikni „Proveri ponovo&ldquo;.
          </p>

          <div className="flex flex-col gap-2">
            <Button asChild variant="lime" size="lg">
              <a href={ctaHref} target="_blank" rel="noopener noreferrer">
                Nastavi protokol
              </a>
            </Button>

            <RecheckAccessButton />

            <Button asChild variant="outline" size="lg">
              <a href={`mailto:${supportEmail}`}>Kontaktiraj podršku</a>
            </Button>

            <SignOutButton redirectUrl="/sign-in">
              <Button variant="ghost" size="lg">
                Odjavi se / promeni nalog
              </Button>
            </SignOutButton>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
