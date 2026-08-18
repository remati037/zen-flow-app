import { BackfillButton } from '@/components/admin/backfill-button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ORDERS_PAGE_SIZE, listAdminOrders } from '@/lib/admin/orders'
import { formatIsoDateSr, toBelgradeIso } from '@/lib/dates'
import { pluralSr } from '@/lib/format'

const PRODUCT_LABELS: Record<'full' | 'refill', string> = {
  full: 'Pun protokol',
  refill: 'Refill',
}

export default async function AdminPorudzbinePage() {
  const { rows, total, truncated } = await listAdminOrders()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Porudžbine</h1>
        <p className="text-slate-mid">WooCommerce sync i verifikacija pristupa.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Backfill iz WooCommerce-a</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-mid">
            Uvozi istorijske porudžbine (<span className="font-medium">processing</span> i{' '}
            <span className="font-medium">completed</span>) preko REST API-ja i osvežava VIP status
            kupaca. Istorijske porudžbine ne naduvavaju zalihe — top-up važi samo za žive webhook-e.
          </p>
          <BackfillButton />
        </CardContent>
      </Card>

      <div className="flex items-baseline justify-between gap-3 text-xs text-slate-mid">
        <p>
          {total} {pluralSr(total, 'porudžbina', 'porudžbine', 'porudžbina')} u bazi
        </p>
        {truncated && <p>Prikazano poslednjih {ORDERS_PAGE_SIZE}.</p>}
      </div>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-soft">
              Još nema sinhronizovanih porudžbina — pokreni backfill ili sačekaj webhook.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead className="text-right">Pak.</TableHead>
                  <TableHead className="text-right">Kapsule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Woo ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="whitespace-nowrap text-slate-mid">
                      {formatIsoDateSr(toBelgradeIso(order.orderDate), {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate font-medium text-ink">
                      {order.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={order.productType === 'full' ? 'secondary' : 'outline'}>
                        {PRODUCT_LABELS[order.productType]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {order.quantityPackages}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{order.capsulesTotal}</TableCell>
                    <TableCell className="text-slate-mid">{order.status}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-soft">
                      #{order.wooOrderId}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-soft">
        Novčani iznos se ne čuva u <code>orders</code> šemi — sync mapira samo ono što pristup i
        zalihe traže (SKU/tip, pakovanja, kapsule). Iznos bi tražio migraciju + ponovni sync.
      </p>
    </div>
  )
}
