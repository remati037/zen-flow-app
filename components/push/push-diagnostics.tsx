'use client'

import { useState } from 'react'
import { CheckCircle2, RotateCcw, Stethoscope, XCircle } from 'lucide-react'

import { toast } from 'sonner'

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
  subscriptions: { count: number; services: string[]; lastSeenAt: string[] }
  cronSecretSet: boolean
  notificationsDispatcher: {
    note: string
    seenDoseReminders: boolean
    now: string
    today: string
    eligible: boolean
    windowMin: number
    staleAfterHours: number
    health: {
      status: 'ok' | 'gaps' | 'stale' | 'never'
      sinceLastRunMin: number | null
      lastRunAt: string | null
      lastGapMin: number | null
      maxGapMin: number | null
      maxGapAt: string | null
      runsTotal: number
      message: string
    }
    doseChecks: {
      dose: 'morning' | 'evening'
      time: string | null
      window: string | null
      inWindowNow: boolean
      alreadyTakenToday: boolean
      alreadyNotifiedToday: boolean
      notifiedAt: string | null
      wouldSendNow: boolean
      reason: string
    }[]
  }
  recentNotifications: { type: string; channel: string; status: string; sentAt: string }[]
  recentPushFailures: number
}

/** Ikonica po stanju heartbeat-a — `gaps` je upozorenje, ne otkaz. */
const HEALTH_ICON: Record<Diagnosis['notificationsDispatcher']['health']['status'], string> = {
  ok: '✅',
  gaps: '⚠️',
  stale: '❌',
  never: '❌',
}

/** '95' → '1h 35min' — isti prikaz kao u `lib/cron/health.ts`, ali bez server importa. */
function formatMin(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

function describeLastRun(health: Diagnosis['notificationsDispatcher']['health']): string {
  if (health.sinceLastRunMin === null) return 'nikad pozvan'
  return `pre ${formatMin(health.sinceLastRunMin)} (${health.runsTotal} run-ova)`
}

/**
 * Admin dijagnostika push lanca. Postoji da se "notifikacija ne stiže" reši sa
 * telefona, bez kopanja po Vercel logovima: pokazuje da li se VAPID par poklapa,
 * ima li pretplata, i šta je poslednje upisano u `notifications_log`.
 */
export function PushDiagnostics() {
  const [data, setData] = useState<Diagnosis | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
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

  /** Briše današnje zapise podsetnika za ovog admina, da dedup pusti ponovni test. */
  async function resetDedup() {
    setResetting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/push/reset-dedup', { method: 'POST' })
      if (!res.ok) {
        setError(`Reset nije uspeo (${res.status}).`)
        return
      }
      const { deleted } = (await res.json()) as { deleted: number }
      toast.success(
        deleted > 0
          ? `Obrisano ${deleted} današnjih zapisa — podsetnik može ponovo.`
          : 'Nije bilo šta da se obriše — dedup te i ne blokira.',
      )
      await run()
    } catch {
      setError('Reset nije uspeo. Pokušaj ponovo.')
    } finally {
      setResetting(false)
    }
  }

  const dedupBlocking = data?.notificationsDispatcher.doseChecks.some(
    (c) => c.alreadyNotifiedToday,
  )

  const health = data?.notificationsDispatcher.health

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={run} disabled={loading} variant="outline">
          <Stethoscope aria-hidden className="size-4" />
          {loading ? 'Proveravam…' : 'Dijagnostika push-a'}
        </Button>

        {dedupBlocking && (
          <Button onClick={resetDedup} disabled={resetting} variant="ghost">
            <RotateCcw aria-hidden className="size-4" />
            {resetting ? 'Resetujem…' : 'Resetuj dedup za danas'}
          </Button>
        )}
      </div>

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
              <dt>Scheduler (poslednji poziv)</dt>
              <dd className="text-ink">
                {health ? `${HEALTH_ICON[health.status]} ${describeLastRun(health)}` : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Najveća rupa u rasporedu</dt>
              <dd className="text-ink">
                {health?.maxGapMin == null
                  ? '— nijedna izmerena'
                  : `${formatMin(health.maxGapMin)} (prozor ${data.notificationsDispatcher.windowMin} min)`}
              </dd>
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

          <div className="space-y-2 border-t border-border pt-3">
            <p className="font-medium text-ink">
              Podsetnici za doze{' '}
              <span className="font-normal text-slate-soft">
                (sada je {data.notificationsDispatcher.now})
              </span>
            </p>

            {data.notificationsDispatcher.doseChecks.map((c) => (
              <div key={c.dose} className="rounded-md bg-white px-3 py-2 ring-1 ring-foreground/10">
                <p className="flex items-center justify-between gap-3 font-medium text-ink">
                  <span>{c.dose === 'morning' ? 'Jutarnja' : 'Večernja'}</span>
                  <span className="font-normal text-slate-mid">
                    {c.time ? `${c.time.slice(0, 5)} · prozor ${c.window}` : 'nije podešeno'}
                  </span>
                </p>
                <p className="mt-1 text-slate-mid">
                  {c.wouldSendNow ? '✅ ' : '— '}
                  {c.reason}
                </p>
              </div>
            ))}

            {!data.notificationsDispatcher.seenDoseReminders && (
              <p className="rounded-md bg-white px-3 py-2 text-slate-mid ring-1 ring-foreground/10">
                {data.notificationsDispatcher.note}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
