import Link from 'next/link'
import { AlertTriangle, PackagePlus, Pill } from 'lucide-react'

import { formatIsoDateSr } from '@/lib/dates'
import { LOW_STOCK_THRESHOLD, estimateDaysRemaining } from '@/lib/protocol/dosing'
import { cn } from '@/lib/utils'

/**
 * Mini pregled zaliha na dashboardu: preostale kapsule, procena dana i datum
 * isteka. Kad padne ispod praga (isti `LOW_STOCK_THRESHOLD` koji koristi
 * low-stock cron) kartica prelazi u alert stanje i nudi refill CTA.
 * Detaljna kartica sa korekcijom broja ostaje na `/zalihe`.
 */
export function SupplyMiniCard({
  capsulesRemaining,
  estimatedRunoutDate,
  refillUrl,
}: {
  capsulesRemaining: number
  estimatedRunoutDate: string | null
  refillUrl: string | null
}) {
  const daysRemaining = estimateDaysRemaining(capsulesRemaining)
  const isLow = capsulesRemaining <= LOW_STOCK_THRESHOLD
  const isEmpty = capsulesRemaining === 0
  const runoutLabel = estimatedRunoutDate ? formatIsoDateSr(estimatedRunoutDate) : null

  return (
    <section
      className={cn(
        'flex flex-col rounded-xl bg-white p-5 shadow-soft ring-1',
        isLow ? 'ring-amber-300' : 'ring-foreground/10',
      )}
    >
      <div className="flex items-center gap-2 text-slate-mid">
        <Pill className="size-4" />
        <h2 className="text-sm font-medium">Zalihe</h2>
      </div>

      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="font-heading text-3xl font-semibold tabular-nums text-ink">
          {capsulesRemaining}
        </span>
        <span className="text-sm font-medium text-slate-mid">kapsula</span>
      </p>

      <p className="mt-1 text-xs text-slate-soft">
        {isEmpty ? (
          'Nema evidentiranih kapsula — dopuni zalihe.'
        ) : (
          <>
            ≈ {daysRemaining} {daysRemaining === 1 ? 'dan' : 'dana'} protokola
            {runoutLabel && <> · do {runoutLabel}</>}
          </>
        )}
      </p>

      {isLow && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>Pri kraju — naruči dopunu da ne prekineš protokol.</span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isLow && refillUrl && (
          <a
            href={refillUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-lime px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-lime-deep"
          >
            <PackagePlus className="size-3.5" />
            Naruči dopunu
          </a>
        )}
        <Link
          href="/zalihe"
          className="rounded-full px-2 py-1.5 text-xs font-medium text-slate-mid transition-colors hover:bg-paper hover:text-ink"
        >
          Detaljno →
        </Link>
      </div>
    </section>
  )
}
