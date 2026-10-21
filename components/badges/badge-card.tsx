import { Lock } from 'lucide-react'

import { getBadge } from '@/lib/badges/catalog'
import { cn } from '@/lib/utils'

/** 'Osvojeno 14. jula 2026.' — beogradski dan, srpska latinica. */
function formatEarnedAt(date: Date): string {
  return new Intl.DateTimeFormat('sr-Latn-RS', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Belgrade',
  }).format(date)
}

/**
 * Jedna kartica u gridu bedževa. Osvojen bedž je u brend boji sa datumom
 * osvajanja; neosvojen ide grayscale + katanac i pokazuje kako se osvaja.
 * Tekstovi i ikona dolaze iz kataloga — komponenta prima samo ključ.
 */
export function BadgeCard({
  badgeKey,
  earnedAt,
}: {
  badgeKey: string
  earnedAt: Date | null
}) {
  const badge = getBadge(badgeKey)
  if (!badge) return null

  const Icon = badge.icon
  const earned = earnedAt !== null

  return (
    <div
      className={cn(
        'relative flex h-full flex-col gap-3 rounded-[20px] p-4 ring-1',
        earned ? 'bg-white ring-ink/[0.08]' : 'bg-white/50 ring-ink/[0.05]',
      )}
    >
      <div className="flex items-start justify-between">
        <span
          aria-hidden
          className={cn(
            'flex size-11 items-center justify-center rounded-2xl',
            earned ? 'bg-ink text-lime' : 'bg-paper text-slate-soft',
          )}
        >
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
        {!earned && <Lock aria-label="Još nije osvojen" className="size-4 text-slate-soft" />}
      </div>

      <div className="space-y-1">
        <p className={cn('text-sm leading-snug font-medium', earned ? 'text-ink' : 'text-slate-mid')}>
          {badge.title}
        </p>
        <p className="text-xs leading-snug text-slate-soft">{badge.description}</p>
      </div>

      {earned && (
        <p className="mt-auto text-xs font-medium text-ink">{formatEarnedAt(earnedAt)}</p>
      )}
    </div>
  )
}
