import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata = {
  title: 'Odjava sa alert mejlova — NuroLab',
}

/**
 * Potvrda posle klika na odjavni link iz mejla.
 *
 * JAVNA stranica (`PUBLIC_ROUTES`) — korisnik dolazi iz mejl klijenta, često na
 * uređaju na kom nije ulogovan. Da traži login, odjava bi za pola ljudi značila
 * „prijavi ovo kao spam". Ne prikazuje nijedan podatak o nalogu (nema ga ni
 * odakle), pa javnost ništa ne otkriva.
 */
export default async function OdjavaMejlovaPage({
  searchParams,
}: {
  searchParams: Promise<{ greska?: string }>
}) {
  const { greska } = await searchParams
  const failed = greska === '1'

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <Card className="w-full max-w-md shadow-soft" size="default">
        <CardHeader>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            NuroLab · ZenFlow
          </p>
          <CardTitle className="text-lg">
            {failed ? 'Link nije važeći' : 'Alert mejlovi su isključeni'}
          </CardTitle>
          <CardDescription>
            {failed
              ? 'Odjavni link je nepotpun ili je izmenjen u prenosu. Alerte možeš isključiti i iz same aplikacije, u Podešavanjima.'
              : 'Više ti ne šaljemo mejlove o niskim zalihama. Ovo ne dira tvoj nalog, streak ni push podsetnike.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {!failed && (
            <p className="text-sm text-slate-mid">
              Predomislio si se? Uključi ih ponovo u{' '}
              <span className="font-medium text-ink">Podešavanja → Notifikacije</span>.
            </p>
          )}

          <Button asChild variant="lime" size="lg">
            <Link href="/podesavanja">Otvori podešavanja</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
