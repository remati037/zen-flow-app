import { redirect } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentProfile } from '@/lib/auth'

import { ConsentForm } from './consent-form'

export const metadata = {
  title: 'Saglasnost · NuroLab',
}

/**
 * Pristanak za podatke o zdravlju za naloge onboardovane pre nego što je uveden
 * (`requireAppAccess` ih šalje ovde). Van (app) grupe da ne uđe u petlju gejta;
 * middleware ga štiti (auth.protect).
 *
 * Gejt pristupa (kupovina) se ovde namerno ne proverava: davanje pristanka ne otvara
 * ništa, a neaktivan korisnik iz app-a ionako prvo ide na `/nemas-pristup`.
 */
export default async function SaglasnostPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/sign-in')
  if (!profile.onboardingCompleted) redirect('/onboarding')
  if (profile.healthConsentAt) redirect('/dashboard')

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <Card className="w-full max-w-md shadow-soft" size="default">
        <CardHeader>
          <p className="text-xs font-medium tracking-wide text-slate-soft uppercase">
            Tvoji podaci
          </p>
          <CardTitle className="text-lg">Potrebna je tvoja saglasnost</CardTitle>
          <CardDescription>
            Aplikacija beleži doze, zalihe i kako se osećaš. To su podaci o zdravlju, pa za njih
            tražimo izričitu saglasnost. Tvoji podaci i niz ostaju kakvi jesu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConsentForm />
        </CardContent>
      </Card>
    </main>
  )
}
