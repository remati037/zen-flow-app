import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { BadgeCard } from '@/components/badges/badge-card'
import { BADGE_CATALOG, BADGE_COUNT } from '@/lib/badges/catalog'
import { getCurrentProfile } from '@/lib/auth'
import { badges, db } from '@/lib/db'

export default async function BedzeviPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/sign-in')

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
        <h1 className="text-2xl font-medium text-ink">Bedževi</h1>
        <p className="text-slate-mid">
          {earnedCount === 0
            ? 'Doslednost otključava bedževe — kreni od prve doze.'
            : 'Osvojeni bedževi za doslednost u protokolu i fokusu.'}
        </p>
      </header>

      <div className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-foreground/10">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-heading text-lg font-medium text-ink">
            {earnedCount}/{BADGE_COUNT} osvojeno
          </span>
          <span className="text-sm text-slate-soft">{progress}%</span>
        </div>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-paper"
          role="progressbar"
          aria-valuenow={earnedCount}
          aria-valuemin={0}
          aria-valuemax={BADGE_COUNT}
          aria-label="Osvojeni bedževi"
        >
          <div
            className="h-full rounded-full bg-lime transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
