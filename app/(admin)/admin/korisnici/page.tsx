import { Card, CardContent } from '@/components/ui/card'

export default function AdminKorisniciPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Korisnici</h1>
        <p className="text-slate-mid">Lista naloga, role i status pristupa.</p>
      </header>
      <Card>
        <CardContent className="py-12 text-center text-slate-soft">
          Uskoro — tabela korisnika i upravljanje pristupom.
        </CardContent>
      </Card>
    </div>
  )
}
