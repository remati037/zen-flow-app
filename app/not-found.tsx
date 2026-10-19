import Link from 'next/link'

import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Stranica ne postoji · ZenFlow',
}

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <p className="font-heading text-5xl font-semibold text-ink">404</p>
        <div className="space-y-1.5">
          <h1 className="text-xl font-medium text-ink">Ova stranica ne postoji</h1>
          <p className="text-sm text-slate-mid">Link je možda zastareo ili pogrešno ukucan.</p>
        </div>
        <Button asChild variant="dark" size="lg">
          <Link href="/dashboard">Nazad na početnu</Link>
        </Button>
      </div>
    </main>
  )
}
