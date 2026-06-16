import { Card, CardContent } from '@/components/ui/card'

export default function AdminPorudzbinePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Porudžbine</h1>
        <p className="text-slate-mid">WooCommerce sync i verifikacija pristupa.</p>
      </header>
      <Card>
        <CardContent className="py-12 text-center text-slate-soft">
          Uskoro — pregled porudžbina iz WooCommerce sync-a.
        </CardContent>
      </Card>
    </div>
  )
}
