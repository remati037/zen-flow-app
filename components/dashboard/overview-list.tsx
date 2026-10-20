import Link from 'next/link'
import { Award, ChevronRight, Layers, PackagePlus, Pill, Timer, type LucideIcon } from 'lucide-react'

import { BADGE_COUNT, getBadge } from '@/lib/badges/catalog'
import { belgradeToday, formatIsoDateSr } from '@/lib/dates'
import { pluralSr } from '@/lib/format'
import { estimateDaysRemaining, isLowStock } from '@/lib/protocol/dosing'
import { cn } from '@/lib/utils'

/**
 * Pregled ispod glavne kartice: zalihe, fokus i bedževi kao JEDNA grupisana
 * lista (redovi sa razdelnikom), umesto tri odvojene kartice iste težine.
 * Glavna kartica nosi akciju dana; ovo je mirno stanje ostalog.
 */
export function OverviewList({
  capsulesRemaining,
  estimatedRunoutDate,
  refillUrl,
  focusSessions,
  focusMinutes,
  earnedBadgeKeys,
  stackCount,
  stackNeedsConfirm,
}: {
  capsulesRemaining: number
  estimatedRunoutDate: string | null
  refillUrl: string | null
  focusSessions: number
  focusMinutes: number
  /** Najnoviji prvi. */
  earnedBadgeKeys: string[]
  /** Aktivnih suplemenata u „Mom stack-u". */
  stackCount: number
  /** Nedeljna potvrda je na redu. */
  stackNeedsConfirm: boolean
}) {
  const low = isLowStock(capsulesRemaining, estimatedRunoutDate, belgradeToday())
  const days = estimateDaysRemaining(capsulesRemaining)
  const runout = estimatedRunoutDate
    ? formatIsoDateSr(estimatedRunoutDate, { day: 'numeric', month: 'short' })
    : null
  const latestBadge = earnedBadgeKeys.map(getBadge).find(Boolean)
  const earned = earnedBadgeKeys.filter((k) => getBadge(k)).length

  return (
    <section className="overflow-hidden rounded-[24px] bg-white ring-1 ring-ink/[0.06]">
      <ul className="divide-y divide-ink/[0.06]">
        <Row
          href="/zalihe"
          icon={Pill}
          title="Zalihe"
          tone={low ? 'caution' : 'default'}
          meta={
            capsulesRemaining === 0
              ? 'Nemaš više kapsula'
              : low
                ? `Pri kraju · još oko ${days} ${days === 1 ? 'dan' : 'dana'}`
                : `Oko ${days} dana${runout ? ` · do ${runout}` : ''}`
          }
          value={`${capsulesRemaining}`}
          unit="kaps."
        />
        <Row
          href="/fokus"
          icon={Timer}
          title="Fokus danas"
          meta={
            focusSessions === 0
              ? 'Još nijedan blok danas'
              : `${focusMinutes} min fokusiranog rada`
          }
          value={`${focusSessions}`}
          unit={pluralSr(focusSessions, 'blok', 'bloka', 'blokova')}
        />
        <Row
          href="/stack"
          icon={Layers}
          title="Moj stack"
          tone={stackNeedsConfirm ? 'caution' : 'default'}
          meta={
            stackCount === 0
              ? 'Dodaj suplemente koje piješ'
              : stackNeedsConfirm
                ? 'Potvrdi da je stack isti'
                : 'Svi na jednom mestu'
          }
          value={`${stackCount}`}
          unit={pluralSr(stackCount, 'suplement', 'suplementa', 'suplemenata')}
        />
        <Row
          href="/bedzevi"
          icon={Award}
          title="Bedževi"
          meta={latestBadge ? `Poslednji: ${latestBadge.title}` : 'Prvi stiže uz prvu dozu'}
          value={`${earned}/${BADGE_COUNT}`}
        />
      </ul>

      {low && refillUrl && (
        <div className="border-t border-ink/[0.06] p-3">
          <a
            href={refillUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-lime px-4 text-sm font-medium text-ink transition-colors hover:bg-lime-deep"
          >
            <PackagePlus aria-hidden className="size-4" />
            Naruči dopunu
          </a>
        </div>
      )}
    </section>
  )
}

function Row({
  href,
  icon: Icon,
  title,
  meta,
  value,
  unit,
  tone = 'default',
}: {
  href: string
  icon: LucideIcon
  title: string
  meta: string
  value: string
  unit?: string
  tone?: 'default' | 'caution'
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-[72px] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-paper/60"
      >
        <span
          aria-hidden
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            tone === 'caution' ? 'bg-caution-soft text-caution' : 'bg-paper text-ink',
          )}
        >
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{title}</span>
          <span
            className={cn(
              'mt-0.5 block truncate text-xs',
              tone === 'caution' ? 'text-caution' : 'text-slate-soft',
            )}
          >
            {meta}
          </span>
        </span>
        <span className="flex shrink-0 items-baseline gap-1">
          <span className="font-heading text-lg font-semibold text-ink tabular-nums">{value}</span>
          {unit && <span className="text-xs text-slate-soft">{unit}</span>}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-soft" />
      </Link>
    </li>
  )
}
