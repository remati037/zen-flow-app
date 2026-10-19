'use client'

import { ErrorScreen } from '@/components/states/error-screen'

/** Greška u stranici app-a — shell (header, navigacija) ostaje, pa korisnik ima izlaz. */
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} />
}
