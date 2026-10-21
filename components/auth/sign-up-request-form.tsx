'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'

import { requestSignUpLink } from '@/app/(auth)/sign-up/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * `/sign-up` bez pozivnice: kupac unese mejl kojim je kupovao i dobije link.
 *
 * Posle slanja forma prikazuje ISTU poruku bez obzira na ishod (vidi
 * `requestSignUpLink`) — zato nema „mejl nije pronađen" grane.
 */
export function SignUpRequestForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentMessage, setSentMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await requestSignUpLink({ email })
      if (!result.ok) {
        setError(result.fieldErrors?.email?.[0] ?? result.error)
        return
      }
      setSentMessage(result.data.message)
    })
  }

  return (
    <Card className="w-full max-w-md shadow-soft">
      <CardHeader>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          ZenFlow Companion
        </p>
        <CardTitle className="text-lg">Registracija</CardTitle>
        <CardDescription>
          Aplikacija je za ZenFlow kupce. Unesi mejl kojim si kupovao na nurolab.rs i poslaćemo ti
          link za registraciju.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {sentMessage ? (
          <div className="flex gap-3 rounded-lg bg-muted/50 px-4 py-3">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-ink" />
            <div className="space-y-2 text-sm">
              <p className="text-foreground">{sentMessage}</p>
              <p className="text-muted-foreground">
                Ne vidiš mejl? Proveri Spam/Promocije, ili{' '}
                <button
                  type="button"
                  className="font-medium text-ink underline underline-offset-4"
                  onClick={() => setSentMessage(null)}
                >
                  pokušaj drugim mejlom
                </button>
                .
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signup-email">Mejl sa porudžbine</Label>
              <Input
                id="signup-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? true : undefined}
                placeholder="ime@primer.rs"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
            <Button type="submit" variant="lime" size="lg" disabled={isPending || !email.trim()}>
              {isPending ? 'Šaljem…' : 'Pošalji mi link'}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Već imaš nalog?{' '}
          <Link href="/sign-in" className="font-medium text-ink underline underline-offset-4">
            Prijavi se
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
