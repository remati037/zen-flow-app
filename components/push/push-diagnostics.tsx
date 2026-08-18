'use client'

import { useState } from 'react'
import { CheckCircle2, Stethoscope, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Diagnosis = {
  verdict: 'ok' | 'blokirano'
  blockers: string[]
  vapid: {
    publicKeySet: boolean
    privateKeySet: boolean
    publicKeyPrefix: string | null
    pairMatches: boolean | null
    subject: string
  }
  subscriptions: { count: number; services: string[] }
  cronSecretSet: boolean
  notificationsDispatcher: { note: string; seenDoseReminders: boolean }
  recentNotifications: { type: string; channel: string; status: string; sentAt: string }[]
  recentPushFailures: number
}

/**
 * Admin dijagnostika push lanca. Postoji da se "notifikacija ne stiže" reši sa
 * telefona, bez kopanja po Vercel logovima: pokazuje da li se VAPID par poklapa,
 * ima li pretplata, i šta je poslednje upisano u `notifications_log`.
 */
export function PushDiagnostics() {
  const [data, setData] = useState<Diagnosis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/push/diagnose')
      if (!res.ok) {
        setError(res.status === 403 ? 'Nemaš admin dozvolu.' : `Greška ${res.status}.`)
        return
      }
      setData((await res.json()) as Diagnosis)
    } catch {
      setError('Dijagnostika nije uspela. Pokušaj ponovo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={run} disabled={loading} variant="outline">
        <Stethoscope aria-hidden className="size-4" />
        {loading ? 'Proveravam…' : 'Dijagnostika push-a'}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <div className="space-y-3 rounded-lg bg-paper p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-ink">
            {data.verdict === 'ok' ? (
              <CheckCircle2 aria-hidden className="size-4" />
            ) : (
              <XCircle aria-hidden className="size-4" />
            )}
            {data.verdict === 'ok' ? 'Lanac je ispravan' : 'Lanac je blokiran'}
          </p>

          {data.blockers.length > 0 && (
            <ul className="space-y-2">
              {data.blockers.map((b) => (
                <li key={b} className="rounded-md bg-white px-3 py-2 text-slate-mid ring-1 ring-foreground/10">
                  {b}
                </li>
              ))}
            </ul>
          )}

          <dl className="grid gap-1.5 text-slate-mid">
            <div className="flex justify-between gap-4">
              <dt>VAPID par</dt>
              <dd className="text-ink">
                {data.vapid.pairMatches === true
                  ? '✅ poklapa se'
                  : data.vapid.pairMatches === false
                    ? '❌ NE poklapa se'
                    : '— nije proverljiv'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Javni ključ (prefiks)</dt>
              <dd className="font-mono text-xs text-ink">{data.vapid.publicKeyPrefix ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Pretplate</dt>
              <dd className="text-ink">
                {data.subscriptions.count}
                {data.subscriptions.services.length > 0 && ` (${data.subscriptions.services.join(', ')})`}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>CRON_SECRET</dt>
              <dd className="text-ink">{data.cronSecretSet ? '✅ postavljen' : '❌ nedostaje'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Dose reminderi ikad poslati</dt>
              <dd className="text-ink">
                {data.notificationsDispatcher.seenDoseReminders ? '✅ da' : '❌ nijedan'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Neuspela push slanja (poslednjih 15)</dt>
              <dd className="text-ink">{data.recentPushFailures}</dd>
            </div>
          </dl>

          {!data.notificationsDispatcher.seenDoseReminders && (
            <p className="rounded-md bg-white px-3 py-2 text-slate-mid ring-1 ring-foreground/10">
              {data.notificationsDispatcher.note}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
