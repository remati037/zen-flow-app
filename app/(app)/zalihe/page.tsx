import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { SupplyCard } from '@/components/supply/supply-card'
import { getCurrentProfile } from '@/lib/auth'
import { db, supply } from '@/lib/db'

export default async function ZalihePage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/sign-in')

  const [row] = await db
    .select({
      capsulesRemaining: supply.capsulesRemaining,
      estimatedRunoutDate: supply.estimatedRunoutDate,
    })
    .from(supply)
    .where(eq(supply.userId, profile.id))
    .limit(1)

  const refillUrl = process.env.NEXT_PUBLIC_SHOP_REFILL_URL ?? null

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Zalihe</h1>
        <p className="text-slate-mid">Preostale kapsule i alerti za niske zalihe.</p>
      </header>

      <SupplyCard
        capsulesRemaining={row?.capsulesRemaining ?? 0}
        estimatedRunoutDate={row?.estimatedRunoutDate ?? null}
        refillUrl={refillUrl}
      />
    </div>
  )
}
