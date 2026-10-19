'use client'

import './globals.css'

import { ErrorScreen } from '@/components/states/error-screen'

/**
 * Greška u SAMOM root layout-u (npr. ClerkProvider) — zamenjuje ceo dokument,
 * pa mora da ima svoj `<html>`/`<body>` i sam uvozi stilove. Bez fontova i
 * provajdera: što manje zavisnosti, to manje šanse da i ovaj ekran padne.
 */
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="sr-Latn">
      <body className="bg-paper">
        <main className="flex min-h-dvh items-center justify-center">
          <ErrorScreen {...props} homeHref="/" homeLabel="Početna" />
        </main>
      </body>
    </html>
  )
}
