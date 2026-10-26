import { MergeCustomForm } from '@/components/admin/merge-custom-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getStackReport } from '@/lib/admin/stack'
import { belgradeToday } from '@/lib/dates'
import { FRESH_WITHIN_DAYS } from '@/lib/supplements/confirm-rules'

export const metadata = {
  title: 'Suplementi · ZenFlow admin',
}

function share(part: number | null, of: number): string {
  if (part === null || of === 0) return '—'
  return `${Math.round((part / of) * 100)}%`
}

/**
 * Zbirni pregled „Mog stack-a": šta korisnici piju uz ZenFlow. Samo agregat — bez imena i
 * mejlova. Grupe od 1–2 korisnika prikazuju se kao „< 3".
 */
export default async function AdminStackPage() {
  const report = await getStackReport(belgradeToday())

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-medium tracking-[-0.03em] text-ink">Suplementi korisnika</h1>
        <p className="text-slate-mid">
          Šta korisnici piju uz ZenFlow. Računa se samo unos potvrđen u poslednjih {FRESH_WITHIN_DAYS} dana.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Po suplementu</CardTitle>
          <CardDescription>
            {report.usersWithStack} od {report.onboarded} onboardovanih ima svež stack.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <p className="text-sm text-slate-mid">Još nema unosa.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-soft">
                  <th className="py-2 font-medium">Suplement</th>
                  <th className="py-2 text-right font-medium">Korisnika</th>
                  <th className="py-2 text-right font-medium">Udeo</th>
                  <th className="py-2 text-right font-medium">Nepotvrđeno</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.06]">
                {report.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="py-2.5 text-ink">{r.label}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink">{r.freshUsers ?? '< 3'}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-mid">
                      {share(r.freshUsers, report.onboarded)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-soft">{r.staleUsers ?? '< 3'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Slobodni unosi („Drugo“)</CardTitle>
          <CardDescription>
            Nespojeni nazivi, najčešći prvi (najviše 50). Spoji ih sa stavkom iz kataloga da uđu u zbir iznad. Ovde su tačni brojevi (bez praga „&lt; 3“), ali nikad ne vidiš ko je uneo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.custom.length === 0 ? (
            <p className="text-sm text-slate-mid">Nema nespojenih unosa.</p>
          ) : (
            <ul className="divide-y divide-ink/[0.06]">
              {report.custom.map((c) => (
                <li key={c.name} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="text-ink">
                    {c.name} <span className="text-xs text-slate-soft tabular-nums">· {c.users}</span>
                  </span>
                  <MergeCustomForm name={c.name} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
