import { AccessStatusBadge } from '@/components/admin/access-status-badge'
import { UserActionsDialog } from '@/components/admin/user-actions-dialog'
import { UserSearch } from '@/components/admin/user-search'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { USERS_PAGE_SIZE, listAdminUsers } from '@/lib/admin/users'
import { belgradeToday, daysBetweenIso, formatIsoDateSr } from '@/lib/dates'
import { pluralSr } from '@/lib/format'
import { LOW_STOCK_THRESHOLD } from '@/lib/protocol/dosing'

/** 'YYYY-MM-DD' → 'danas' / 'juče' / 'pre N dana' / datum. */
function checkInLabel(date: string | null, today: string): string {
  if (!date) return '—'
  const diff = daysBetweenIso(date, today)
  if (diff <= 0) return 'danas'
  if (diff === 1) return 'juče'
  if (diff < 7) return `pre ${diff} dana`
  return formatIsoDateSr(date, { day: 'numeric', month: 'short' })
}

export default async function AdminKorisniciPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const search = q?.trim() ?? ''
  const { rows, total, truncated } = await listAdminUsers(search)
  const today = belgradeToday()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Korisnici</h1>
        <p className="text-slate-mid">Lista naloga, role i status pristupa.</p>
      </header>

      <UserSearch defaultValue={search || undefined} />

      <div className="flex items-baseline justify-between gap-3 text-xs text-slate-mid">
        <p>
          {search ? (
            <>
              {total} {pluralSr(total, 'rezultat', 'rezultata', 'rezultata')} za{' '}
              <span className="font-medium text-ink">“{search}”</span>
            </>
          ) : (
            <>
              {total} {pluralSr(total, 'korisnik', 'korisnika', 'korisnika')} ukupno
            </>
          )}
        </p>
        {truncated && <p>Prikazano prvih {USERS_PAGE_SIZE} — suzi pretragu.</p>}
      </div>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-soft">
              {search ? 'Nema korisnika za tu pretragu.' : 'Još nema registrovanih korisnika.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Korisnik</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Streak</TableHead>
                  <TableHead className="text-right">Kapsule</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead className="text-right">Akcije</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="max-w-[16rem]">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink">{user.email}</span>
                        {user.role === 'admin' && (
                          <Badge variant="outline" className="shrink-0">
                            admin
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-slate-soft">{user.name ?? 'Bez imena'}</span>
                    </TableCell>
                    <TableCell>
                      <AccessStatusBadge status={user.accessStatus} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {user.streak > 0 ? `${user.streak} 🔥` : '0'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {user.capsulesRemaining === null ? (
                        <span className="text-slate-soft">—</span>
                      ) : (
                        <span
                          className={
                            user.capsulesRemaining <= LOW_STOCK_THRESHOLD
                              ? 'font-medium text-destructive'
                              : undefined
                          }
                        >
                          {user.capsulesRemaining}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-mid">
                      {checkInLabel(user.lastCheckInDate, today)}
                    </TableCell>
                    <TableCell className="text-right">
                      <UserActionsDialog user={user} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
