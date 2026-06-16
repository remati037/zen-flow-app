import { SignOutButton } from '@clerk/nextjs'
import { redirect } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { refreshAccessStatusForProfile } from '@/lib/access/status'
import { getCurrentProfile, isAdmin } from '@/lib/auth'

export const metadata = {
  title: 'Nemaš pristup — NuroLab',
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

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <Card className="w-full max-w-md shadow-soft" size="default">
        <CardHeader>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            ZenFlow pristup
          </p>
          <CardTitle className="text-lg">Nalog još nema pristup</CardTitle>
          <CardDescription>
            Companion aplikaciju koriste ZenFlow kupci. Nismo pronašli porudžbinu vezanu za tvoj
            nalog.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="rounded-lg bg-muted/50 px-4 py-3">
            <p className="text-xs text-muted-foreground">Registrovan mejl</p>
            <p className="font-medium break-all text-foreground">{profile.email}</p>
          </div>

          <p className="text-sm text-muted-foreground">
            Registruj se <strong className="text-foreground">istim mejlom</strong> koji si koristio
            pri kupovini na nurolab.rs. Ako si tek poručio, pristup se aktivira u par minuta — osveži
            ovu stranicu.
          </p>

          <div className="flex flex-col gap-2">
            <Button asChild variant="lime" size="lg">
              <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                Kupi ZenFlow
              </a>
            </Button>

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
