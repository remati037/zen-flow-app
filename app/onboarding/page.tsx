import { redirect } from 'next/navigation'

import { refreshAccessStatusForProfile } from '@/lib/access/status'
import { getCurrentProfile, isAdmin } from '@/lib/auth'
import { db, orders } from '@/lib/db'
import { SYNCED_STATUSES } from '@/lib/woocommerce/order-rules'
import { and, inArray, sql } from 'drizzle-orm'

import { OnboardingWizard } from './onboarding-wizard'

export const metadata = {
  title: 'Onboarding — NuroLab',
}

/**
 * Onboarding (Korak 1.4) — setup protokola pri prvom ulasku.
 * Van (app) grupe da ne uđe u petlju sa gejtom u (app)/layout.tsx; middleware ga štiti.
 */
export default async function OnboardingPage() {
  const profile = await getCurrentProfile()
  if (!profile) {
    redirect('/sign-in')
  }

  // Isti gejt pristupa kao app layout: samo važeći kupci prolaze dalje.
  const authoritativeRole = (await isAdmin()) ? 'admin' : 'user'
  const status = await refreshAccessStatusForProfile(profile, authoritativeRole)
  if (status === 'inactive') {
    redirect('/nemas-pristup')
  }

  // Već prošao onboarding → pravo u app.
  if (profile.onboardingCompleted) {
    redirect('/dashboard')
  }

  // Prefil broja pakovanja iz zbira porudžbina za korisnikov mejl (default 1).
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${orders.quantityPackages}), 0)` })
    .from(orders)
    // Opozvane porudžbine ne ulaze u prefil pakovanja.
    .where(
      and(
        sql`lower(${orders.email}) = ${profile.email.trim().toLowerCase()}`,
        inArray(orders.status, [...SYNCED_STATUSES]),
      ),
    )

  const defaultPackages = Math.max(1, Number(row?.total ?? 0))

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4 py-12">
      <OnboardingWizard defaultPackages={defaultPackages} />
    </main>
  )
}
