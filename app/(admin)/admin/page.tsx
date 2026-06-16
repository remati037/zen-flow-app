import { Card, CardContent } from '@/components/ui/card'

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Pregled</h1>
        <p className="text-slate-mid">Metrike i upravljanje korisnicima.</p>
      </header>
      <Card>
        <CardContent className="py-12 text-center text-slate-soft">
          Uskoro — admin metrike i prečice.
        </CardContent>
      </Card>
    </div>
  )
}
