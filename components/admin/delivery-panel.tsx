import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DeliveryCounts, DeliveryReport } from '@/lib/admin/delivery'
import { formatIsoDateSr } from '@/lib/dates'

/** Ljudsko ime tipa notifikacije; nepoznat tip se prikazuje kakav jeste. */
const TYPE_LABELS: Record<string, string> = {
  dose_reminder_morning: 'Jutarnja doza',
  dose_reminder_evening: 'Večernja doza',
  streak_at_risk: 'Streak u riziku',
  low_stock_alert: 'Niske zalihe',
  welcome: 'Dobrodošlica',
  test: 'Test',
}

function attempted(c: DeliveryCounts): number {
  return c.success + c.failed + c.pending
}

/**
 * Isporučenost notifikacija — agregat `notifications_log` po beogradskom danu (O-M1).
 *
 * Odgovara na pitanje koje metrika „Notifikacije 7d" nije mogla: KOLIKO je stvarno
 * izašlo, po kanalu i po danu. Jedan zbir ne razlikuje tih otkaz push kanala od
 * mirnog dana; kolona sa nulom usred serije se vidi odmah.
 *
 * Server komponenta — podaci dolaze iz `getDeliveryReport`, bez klijentskog fetch-a.
 */
export function DeliveryPanel({ report }: { report: DeliveryReport }) {
  const maxDay = Math.max(
    1,
    ...report.days.map((d) => attempted(d.push) + attempted(d.email)),
  )

  const healthy = report.totals.failed === 0 && report.stuckPending === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Isporučenost notifikacija ({report.windowDays}d)</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="flex items-center gap-2 font-medium text-ink">
            {healthy ? (
              <CheckCircle2 aria-hidden className="size-4" />
            ) : (
              <AlertTriangle aria-hidden className="size-4" />
            )}
            {report.successRate === null
              ? 'Nijedna notifikacija u prozoru'
              : `${report.successRate}% uspešnih`}
          </span>
          <span className="text-slate-mid">
            Poslato <strong className="font-medium text-ink">{report.totals.success}</strong>
          </span>
          <span className="text-slate-mid">
            Neuspelo <strong className="font-medium text-ink">{report.totals.failed}</strong>
          </span>
          <span className="text-slate-mid">
            Zaglavljene rezervacije{' '}
            <strong className="font-medium text-ink">{report.stuckPending}</strong>
          </span>
        </div>

        {report.stuckPending > 0 && (
          <p className="rounded-lg bg-muted/50 px-4 py-3 text-xs text-slate-mid">
            <span className="font-medium text-ink">
              {report.stuckPending} rezervacija nije zatvorena.
            </span>{' '}
            Slanje je prekinuto u letu (timeout funkcije ili deploy usred run-a). Svaka drži dedup
            slot za svoj dan, pa je to isto toliko propuštenih podsetnika. Za sebe ih oslobađaš
            dugmetom „Resetuj dedup za danas&ldquo; u dijagnostici push-a.
          </p>
        )}

        {/* Dnevna serija: dve trake po danu (push / email), širina = udeo u najvišem danu. */}
        <div className="space-y-1.5">
          {report.days.map((d) => {
            const total = attempted(d.push) + attempted(d.email)
            const failed = d.push.failed + d.email.failed
            return (
              <div key={d.date} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-slate-soft">{formatIsoDateSr(d.date)}</span>
                <div className="flex h-2.5 flex-1 gap-0.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-l-full bg-lime"
                    style={{ width: `${((d.push.success + d.email.success) / maxDay) * 100}%` }}
                    title={`Uspešno: ${d.push.success + d.email.success}`}
                  />
                  <div
                    className="h-full bg-destructive/70"
                    style={{ width: `${(failed / maxDay) * 100}%` }}
                    title={`Neuspelo: ${failed}`}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-slate-mid">
                  {total === 0 ? '—' : `${d.push.success + d.email.success}/${total}`}
                </span>
              </div>
            )
          })}
        </div>

        {report.byType.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-4">
            <p className="text-sm font-medium text-ink">Po tipu i kanalu</p>
            {report.byType.map((t) => (
              <div
                key={`${t.type}-${t.channel}`}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="text-slate-mid">
                  {TYPE_LABELS[t.type] ?? t.type}{' '}
                  <span className="text-slate-soft">· {t.channel}</span>
                </span>
                <span className="text-ink">
                  {t.success} poslato
                  {t.failed > 0 && <span className="text-slate-mid"> · {t.failed} neuspelo</span>}
                  {t.pending > 0 && <span className="text-slate-mid"> · {t.pending} zaglavljeno</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
