'use client'

import { ErrorScreen } from '@/components/states/error-screen'

/** Rute van grupa (onboarding, /nemas-pristup, auth) — bez app shell-a, pa pun ekran. */
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper">
      <ErrorScreen {...props} homeHref="/" homeLabel="Početna" />
    </main>
  )
}
