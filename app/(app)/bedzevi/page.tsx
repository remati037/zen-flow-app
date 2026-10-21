import { eq } from 'drizzle-orm'

import { BadgeCard } from '@/components/badges/badge-card'
import { BADGE_CATALOG, BADGE_COUNT } from '@/lib/badges/catalog'
import { requireAppAccess } from '@/lib/access/app-gate'
import { badges, db } from '@/lib/db'

export default async function BedzeviPage() {
  const { profile } = await requireAppAccess()

  const rows = await db
    .select({ badgeKey: badges.badgeKey, earnedAt: badges.earnedAt })
    .from(badges)
    .where(eq(badges.userId, profile.id))

  const earnedAtByKey = new Map(rows.map((r) => [r.badgeKey, r.earnedAt]))
  // Broji se po katalogu — eventualni stari ključ u bazi ne naduvava progres.
  const earnedCount = BADGE_CATALOG.filter((b) => earnedAtByKey.has(b.key)).length
  const progress = Math.round((earnedCount / BADGE_COUNT) * 100)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-medium tracking-[-0.03em] text-ink">Bedževi</h1>
        <p className="text-slate-mid">
          {earnedCount === 0
            ? 'Bedževi stižu uz redovno uzimanje. Kreni od prve doze.'
            : 'Tvoji bedževi iz protokola i fokusa.'}
        </p>
      </header>

      <div className="rounded-[24px] bg-white p-5 ring-1 ring-ink/[0.06]">
        <div className="flex items-baseline justify-between gap-4">
          <span className="flex items-baseline gap-1.5">
            <span className="font-heading text-4xl leading-none font-semibold tracking-[-0.03em] text-ink tabular-nums">
              {earnedCount}
            </span>
            <span className="text-sm text-slate-mid">od {BADGE_COUNT} osvojeno</span>
          </span>
          <span className="text-sm text-slate-soft tabular-nums">{progress}%</span>
        </div>
        <div
          className="mt-4 h-1 w-full overflow-hidden rounded-full bg-paper"
          role="progressbar"
          aria-valuenow={earnedCount}
          aria-valuemin={0}
          aria-valuemax={BADGE_COUNT}
          aria-label="Osvojeni bedževi"
        >
          <div
            className="h-full rounded-full bg-ink transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {BADGE_CATALOG.map((badge) => (
          <BadgeCard
            key={badge.key}
            badgeKey={badge.key}
            earnedAt={earnedAtByKey.get(badge.key) ?? null}
          />
        ))}
      </div>
    </div>
  )
}
