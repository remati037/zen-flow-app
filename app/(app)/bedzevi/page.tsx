import { Card, CardContent } from '@/components/ui/card'

export default function BedzeviPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Bedževi</h1>
        <p className="text-slate-mid">Osvojeni bedževi za doslednost (7/15/30 dana).</p>
      </header>
      <Card>
        <CardContent className="py-12 text-center text-slate-soft">
          Uskoro — bedževi i milestone-ovi.
        </CardContent>
      </Card>
    </div>
  )
}
