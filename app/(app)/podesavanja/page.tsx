import { Card, CardContent } from '@/components/ui/card'

export default function PodesavanjaPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Podešavanja</h1>
        <p className="text-slate-mid">Vreme doza, push notifikacije i profil.</p>
      </header>
      <Card>
        <CardContent className="py-12 text-center text-slate-soft">
          Uskoro — podešavanja protokola i notifikacija.
        </CardContent>
      </Card>
    </div>
  )
}
