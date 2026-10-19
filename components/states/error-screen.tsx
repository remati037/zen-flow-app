'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCcw, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Zajednički sadržaj za `error.tsx` granice (app, admin, koren).
 *
 * Bez ovoga je Next pri grešci u renderu prikazivao svoj podrazumevani ekran na
 * engleskom, bez izlaza. Ovde: srpski tekst, „Pokušaj ponovo" (`reset` ponovo
 * renderuje segment bez punog reload-a) i put nazad.
 *
 * `digest` je ID greške koji Next upisuje u server log — prikazujemo ga da
 * korisnik može da ga pošalje podršci, a da poruka greške (može da nosi interne
 * detalje) nikad ne stigne do ekrana.
 */
export function ErrorScreen({
  error,
  reset,
  homeHref = '/dashboard',
  homeLabel = 'Nazad na početnu',
}: {
  error: Error & { digest?: string }
  reset: () => void
  homeHref?: string
  homeLabel?: string
}) {
  useEffect(() => {
    // Browser konzola (ne server log) — za lokalni debug.
    console.error(error)
  }, [error])

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center" role="alert">
      <span className="flex size-14 items-center justify-center rounded-full bg-white text-ink shadow-soft ring-1 ring-foreground/10">
        {offline ? <WifiOff aria-hidden className="size-6" /> : <RotateCcw aria-hidden className="size-6" />}
      </span>
      <div className="space-y-1.5">
        <h1 className="text-xl font-medium text-ink">
          {offline ? 'Nema internet veze' : 'Nešto nije u redu'}
        </h1>
        <p className="text-sm text-slate-mid">
          {offline
            ? 'Proveri vezu i pokušaj ponovo — tvoji podaci su sačuvani.'
            : 'Stranica nije uspela da se učita. Pokušaj ponovo; ako se ponavlja, javi nam se.'}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Button variant="dark" size="lg" onClick={reset}>
          Pokušaj ponovo
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href={homeHref}>{homeLabel}</Link>
        </Button>
      </div>
      {error.digest && (
        <p className="text-xs text-slate-soft">
          Kod greške: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </div>
  )
}
