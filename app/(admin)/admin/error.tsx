'use client'

import { ErrorScreen } from '@/components/states/error-screen'

export default function AdminError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} homeHref="/admin" homeLabel="Nazad na pregled" />
}
