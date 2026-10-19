import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ACTIVE_DAYS,
  REFILL_CONVERSION_DAYS,
  REFILL_LOOKBACK_DAYS,
  RUNNING_OUT_DAYS,
  getRetentionReport,
} from '@/lib/admin/retention'
import { belgradeToday, formatIsoDateSr } from '@/lib/dates'

export const metadata = {
  title: 'Retencija · ZenFlow admin',
}

function percent(part: number, of: number): string {
  if (of === 0) return 'n/a'
  return `${Math.round((part / of) * 100)}%`
}

function shortDate(iso: string | null): string {
  return iso ? formatIsoDateSr(iso, { day: 'numeric', month: 'short' }) : 'nema'
}

/**
 * Retencija — da li app vraća kupce, i kome se baš sad treba javiti.
 * Funnel i konverzija su agregati u SQL-u (`lib/admin/retention.ts`); liste su
 * ograničene na 50 redova jer su za akciju, ne za izvoz.
 */
export default async function AdminRetencijaPage() {
  const today = belgradeToday()
  const { funnel, refill, runningOut, lapsed, unregisteredBuyers } = await getRetentionReport(today)

  const steps = [
    { label: 'Kupci', value: funnel.buyers, hint: 'različiti mejlovi sa važećom porudžbinom' },
    { label: 'Registrovani', value: funnel.registered, hint: 'imaju nalog u app-u' },
    { label: 'Onboardovani', value: funnel.onboarded, hint: 'postavili protokol' },
    { label: `Aktivni ${ACTIVE_DAYS}d`, value: funnel.active, hint: 'uzeta doza u poslednjih 7 dana' },
  ]
  const top = Math.max(1, funnel.buyers)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Retencija</h1>
        <p className="text-slate-mid">Da li app vraća kupce i kome se sada treba javiti.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Funnel</CardTitle>
          <CardDescription>Od kupovine do svakodnevnog korišćenja.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.map((step, i) => (
            <div key={step.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-ink">{step.label}</span>
                <span className="tabular-nums text-ink">
                  {step.value}
                  {i > 0 && (
                    <span className="ml-2 text-xs text-slate-soft">
                      {percent(step.value, steps[i - 1].value)} od prethodnog
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-paper">
                <div
                  className="h-2 rounded-full bg-ink"
                  style={{ width: `${Math.round((step.value / top) * 100)}%` }}
                />
              </div>
              <p className="mt-0.5 text-xs text-slate-soft">{step.hint}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-foreground/10">
          <p className="text-xs font-medium text-slate-mid">Ponovna kupovina</p>
          <p className="mt-1 font-heading text-2xl font-semibold text-ink tabular-nums">
            {percent(funnel.repeatRegistered.repeat, funnel.repeatRegistered.of)}
            <span className="ml-2 text-sm font-normal text-slate-mid">sa app-om</span>
          </p>
          <p className="text-sm text-slate-mid tabular-nums">
            {percent(funnel.repeatUnregistered.repeat, funnel.repeatUnregistered.of)} bez app-a
          </p>
          <p className="mt-1 text-xs text-slate-soft">
            Udeo kupaca sa 2+ porudžbine. Razlika je signal da app vraća kupce, ali ne i dokaz,
            jer app koriste i posvećeniji kupci.
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-soft ring-1 ring-foreground/10">
          <p className="text-xs font-medium text-slate-mid">Low-stock alert → porudžbina</p>
          <p className="mt-1 font-heading text-2xl font-semibold text-ink tabular-nums">
            {percent(refill.converted, refill.alerted)}
          </p>
          <p className="text-sm text-slate-mid tabular-nums">
            {refill.converted} od {refill.alerted} sa alertom
          </p>
          <p className="mt-1 text-xs text-slate-soft">
            Porudžbina u {REFILL_CONVERSION_DAYS} dana posle prvog alerta, alerti iz poslednjih{' '}
            {REFILL_LOOKBACK_DAYS} dana.
          </p>
        </div>
      </div>

      <ActionList
        title={`Ističu u narednih ${RUNNING_OUT_DAYS} dana`}
        description="Aktivni korisnici kojima zalihe uskoro nestaju. Ovo je najbolji trenutak za ličnu poruku."
        empty="Niko trenutno ne ostaje bez zaliha."
        rows={runningOut.map((r) => ({
          key: r.userId,
          primary: r.name ?? r.email,
          secondary: r.name ? r.email : null,
          meta: `${r.capsulesRemaining} kaps. · ${shortDate(r.estimatedRunoutDate)}`,
        }))}
      />

      <ActionList
        title="Istekao pristup (poslednjih 28 dana)"
        description="Win-back mejlovi im idu automatski; ovo su kandidati za ličan kontakt."
        empty="Nema skorašnjih isteka."
        rows={lapsed.map((r) => ({
          key: r.userId,
          primary: r.name ?? r.email,
          secondary: r.name ? r.email : null,
          meta: `isteklo ${shortDate(r.expiredOn)}`,
        }))}
      />

      <ActionList
        title="Kupili, a nemaju nalog"
        description="Imaju pravo na app (porudžbina u poslednjih 60 dana), ali se nisu registrovali ili su se registrovali drugim mejlom."
        empty="Svi aktivni kupci imaju nalog."
        rows={unregisteredBuyers.map((r) => ({
          key: r.email,
          primary: r.email,
          secondary: null,
          meta: `porudžbina ${shortDate(r.lastOrderDay)}`,
        }))}
      />
    </div>
  )
}

function ActionList({
  title,
  description,
  empty,
  rows,
}: {
  title: string
  description: string
  empty: string
  rows: { key: string; primary: string; secondary: string | null; meta: string }[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} <span className="text-sm font-normal text-slate-soft tabular-nums">({rows.length})</span>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-mid">{empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.primary}</p>
                  {row.secondary && <p className="truncate text-xs text-slate-soft">{row.secondary}</p>}
                </div>
                <span className="shrink-0 text-xs text-slate-mid tabular-nums">{row.meta}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
