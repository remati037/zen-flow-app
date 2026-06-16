import { Card, CardContent } from '@/components/ui/card'

export default function FokusPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Fokus</h1>
        <p className="text-slate-mid">Pomodoro timer za fokusirane blokove rada.</p>
      </header>
      <Card>
        <CardContent className="py-12 text-center text-slate-soft">
          Uskoro — Pomodoro timer.
        </CardContent>
      </Card>
    </div>
  )
}
