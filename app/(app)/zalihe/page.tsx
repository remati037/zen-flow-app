import { eq } from 'drizzle-orm'

import { SupplyCard } from '@/components/supply/supply-card'
import { requireAppAccess } from '@/lib/access/app-gate'
import { db, supply } from '@/lib/db'
import { refillUrl as refillLink } from '@/lib/refill'

export default async function ZalihePage() {
  const { profile } = await requireAppAccess()

  const [row] = await db
    .select({
      capsulesRemaining: supply.capsulesRemaining,
      estimatedRunoutDate: supply.estimatedRunoutDate,
    })
    .from(supply)
    .where(eq(supply.userId, profile.id))
    .limit(1)

  const refillUrl = refillLink('zalihe')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-medium tracking-[-0.03em] text-ink">Zalihe</h1>
        <p className="text-slate-mid">Koliko kapsula ti je ostalo i kad je vreme za dopunu.</p>
      </header>

      <SupplyCard
        capsulesRemaining={row?.capsulesRemaining ?? 0}
        estimatedRunoutDate={row?.estimatedRunoutDate ?? null}
        refillUrl={refillUrl}
      />
    </div>
  )
}
