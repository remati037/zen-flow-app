import Link from 'next/link'
import { Timer } from 'lucide-react'

/** Srpska množina za "sesija" (1 sesija, 2–4 sesije, 5+ sesija). */
function sessionsLabel(n: number): string {
  if (n === 1) return 'sesija'
  return n < 5 ? 'sesije' : 'sesija'
}

/**
 * Današnji fokus učinak (broj Pomodoro sesija + ukupno minuta) sa linkom na
 * `/fokus`. Brojevi dolaze iz iste agregacije koju koristi i fokus stranica.
 */
export function FocusMiniCard({
  sessions,
  minutes,
}: {
  sessions: number
  minutes: number
}) {
  return (
    <section className="flex flex-col rounded-xl bg-white p-5 shadow-soft ring-1 ring-foreground/10">
      <div className="flex items-center gap-2 text-slate-mid">
        <Timer className="size-4" />
        <h2 className="text-sm font-medium">Fokus danas</h2>
      </div>

      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="font-heading text-3xl font-semibold tabular-nums text-ink">
          {sessions}
        </span>
        <span className="text-sm font-medium text-slate-mid">{sessionsLabel(sessions)}</span>
      </p>

      <p className="mt-1 text-xs text-slate-soft">
        {sessions === 0
          ? 'Još nijedan blok — 25 minuta je dovoljno za start.'
          : `Ukupno ${minutes} min fokusiranog rada.`}
      </p>

      <div className="mt-4">
        <Link
          href="/fokus"
          className="inline-flex items-center rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-90"
        >
          {sessions === 0 ? 'Pokreni Pomodoro' : 'Nastavi fokus'}
        </Link>
      </div>
    </section>
  )
}
