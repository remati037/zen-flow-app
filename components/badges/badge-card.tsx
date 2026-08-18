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
        'relative flex flex-col items-center gap-2 rounded-xl p-5 text-center ring-1 transition-all',
        earned
          ? 'bg-white shadow-soft ring-lime'
          : 'bg-white/60 ring-foreground/10 grayscale',
      )}
    >
      {!earned && (
        <span
          className="absolute top-3 right-3 text-slate-soft"
          aria-label="Još nije osvojen"
        >
          <Lock className="size-4" />
        </span>
      )}

      <span
        className={cn(
          'flex size-14 items-center justify-center rounded-full',
          earned ? 'bg-lime text-ink' : 'bg-paper text-slate-soft',
        )}
      >
        <Icon className="size-7" />
      </span>

      <span
        className={cn(
          'font-heading text-base font-medium',
          earned ? 'text-ink' : 'text-slate-mid',
        )}
      >
        {badge.title}
      </span>

      <span className="text-xs leading-snug text-slate-soft">{badge.description}</span>

      <span
        className={cn(
          'mt-1 text-[11px] font-medium',
          earned ? 'text-ink' : 'text-slate-soft',
        )}
      >
        {earned ? `Osvojeno ${formatEarnedAt(earnedAt)}` : 'Zaključano'}
      </span>
    </div>
  )
}
