import Link from 'next/link'
import { Award } from 'lucide-react'

import { BADGE_COUNT, getBadge } from '@/lib/badges/catalog'
import { formatIsoDateSr, toBelgradeIso } from '@/lib/dates'

/** Koliko poslednjih bedževa staje u red na mobilnom bez horizontalnog skrola. */
const MAX_VISIBLE = 4

export interface EarnedBadge {
  badgeKey: string
  earnedAt: Date
}

/**
 * Poslednji osvojeni bedževi (najnoviji prvi). Nepoznati ključevi iz baze se
 * odbacuju — katalog je izvor istine. Prazno stanje (dan 1) objašnjava kako se
 * otključava prvi bedž umesto da prikaže prazan red.
 */
export function RecentBadgesRow({ earned }: { earned: EarnedBadge[] }) {
  const known = earned.filter((b) => getBadge(b.badgeKey))
  const recent = known.slice(0, MAX_VISIBLE)

  return (
    <section className="rounded-xl bg-white p-5 shadow-soft ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-mid">
          <Award className="size-4" />
          <h2 className="text-sm font-medium">Bedževi</h2>
        </div>
        <Link
          href="/bedzevi"
          className="rounded-full px-2 py-1 text-xs font-medium text-slate-mid transition-colors hover:bg-paper hover:text-ink"
        >
          {known.length}/{BADGE_COUNT} →
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="mt-3 text-xs text-slate-soft">
          Prvi bedž otključavaš prvom označenom dozom — kreni odmah danas.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-4 gap-2">
          {recent.map((row) => {
            const badge = getBadge(row.badgeKey)!
            const Icon = badge.icon
            return (
              <li key={row.badgeKey} className="flex flex-col items-center gap-1.5 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-lime text-ink">
                  <Icon className="size-5" />
                </span>
                <span className="text-[11px] leading-tight font-medium text-ink">
                  {badge.title}
                </span>
                <span className="text-[10px] leading-tight text-slate-soft">
                  {formatIsoDateSr(toBelgradeIso(row.earnedAt), {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
