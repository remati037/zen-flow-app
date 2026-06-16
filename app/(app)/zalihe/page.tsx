import { Card, CardContent } from '@/components/ui/card'

export default function ZalihePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Zalihe</h1>
        <p className="text-slate-mid">Preostale kapsule i alerti za niske zalihe.</p>
      </header>
      <Card>
        <CardContent className="py-12 text-center text-slate-soft">
          Uskoro — supply tracking i refill CTA.
        </CardContent>
      </Card>
    </div>
  )
}
