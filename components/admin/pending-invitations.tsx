import { InvitationRowActions } from '@/components/admin/invitation-row-actions'
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
import { formatIsoDateSr, toBelgradeIso } from '@/lib/dates'
import { listPendingInvitations, type PendingInvitation } from '@/lib/invitations/issue'
import { EVENTS, logError } from '@/lib/observability/log'

/**
 * Pending pozivnice iz Clerk-a (on je izvor istine za njih — nema tabele u bazi).
 * Pad Clerk API-ja ne sme da obori celu stranicu korisnika, pa se hvata ovde.
 */
export async function PendingInvitations() {
  let invitations: PendingInvitation[]
  try {
    invitations = await listPendingInvitations()
  } catch (err) {
    logError(EVENTS.inviteFailed, err, { stage: 'list' })
    return (
      <p className="text-sm text-destructive">
        Pozivnice trenutno ne mogu da se učitaju iz Clerk-a. Pokušaj ponovo za koji minut.
      </p>
    )
  }

  if (invitations.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-ink">
        Poslate pozivnice <span className="text-slate-soft">({invitations.length})</span>
      </h2>
      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mejl</TableHead>
                <TableHead>Vrsta</TableHead>
                <TableHead>Poslato</TableHead>
                <TableHead>Važi do</TableHead>
                <TableHead className="text-right">Akcije</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="max-w-[16rem] truncate font-medium text-ink">{inv.email}</TableCell>
                  <TableCell>
                    {inv.kind === 'buyer' ? (
                      <Badge variant="outline">kupac</Badge>
                    ) : (
                      <Badge variant="outline">pozivnica · VIP</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-mid">
                    {formatIsoDateSr(toBelgradeIso(inv.createdAt), { day: 'numeric', month: 'short' })}
                  </TableCell>
                  <TableCell className="text-slate-mid">
                    {inv.expiresAt
                      ? formatIsoDateSr(toBelgradeIso(inv.expiresAt), { day: 'numeric', month: 'short' })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <InvitationRowActions id={inv.id} url={inv.url} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  )
}
