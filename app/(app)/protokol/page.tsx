import { Card, CardContent } from '@/components/ui/card'

export default function ProtokolPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Protokol</h1>
        <p className="text-slate-mid">Dnevni check-in doza i streak mehanika.</p>
      </header>
      <Card>
        <CardContent className="py-12 text-center text-slate-soft">
          Uskoro — protocol tracker sa streak-om.
        </CardContent>
      </Card>
    </div>
  )
}
