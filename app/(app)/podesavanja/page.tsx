import { eq } from 'drizzle-orm'

import { AccountCard } from '@/components/settings/account-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PushToggle } from '@/components/push/push-toggle'
import { SettingsForm } from '@/components/settings/settings-form'
import type { AccessStatus } from '@/lib/access/status'
import { VIP_WINDOW_DAYS, getLatestOrderDate, resolveAccessStatus } from '@/lib/access/status'
import { getCurrentProfile, isAdmin } from '@/lib/auth'
import { addDaysIso, formatIsoDateSr, toBelgradeIso } from '@/lib/dates'
import { db, pushSubscriptions } from '@/lib/db'

export default async function PodesavanjaPage() {
  const profile = await getCurrentProfile()

  // Da li korisnik već ima bar jednu push pretplatu (server-side hint za toggle).
  let hasPush = false
  if (profile) {
    const subs = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, profile.id))
      .limit(1)
    hasPush = subs.length > 0
  }

  // Status pristupa računamo istim pravilom kao lib/access/status.ts (bez novog upisa) —
  // layout već osvežava DB, ali render layout-a i stranice ide paralelno pa `profile.accessStatus`
  // ume da bude za korak stariji. Rola iz Clerk claim-a je izvor istine, kao u layout-u.
  let status: AccessStatus | null = null
  let vipUntilLabel: string | null = null
  if (profile) {
    const authoritativeRole = (await isAdmin()) ? 'admin' : 'user'
    const latestOrderDate = await getLatestOrderDate(profile.email)
    status = resolveAccessStatus({
      role: authoritativeRole,
      currentStatus: profile.accessStatus,
      latestOrderDate,
      now: new Date(),
    })
    // "VIP do" = dan poslednje porudžbine + 60 dana (VIP_WINDOW_DAYS), u beogradskom kalendaru.
    if (latestOrderDate) {
      vipUntilLabel = formatIsoDateSr(
        addDaysIso(toBelgradeIso(latestOrderDate), VIP_WINDOW_DAYS),
      )
    }
  }

  const refillUrl = process.env.NEXT_PUBLIC_SHOP_REFILL_URL ?? null

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Podešavanja</h1>
        <p className="text-slate-mid">Vreme doza, push notifikacije i profil.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Profil i protokol</CardTitle>
        </CardHeader>
        <CardContent>
          {profile ? (
            <SettingsForm
              initialName={profile.name}
              initialMorningTime={profile.doseMorningTime}
              initialEveningTime={profile.doseEveningTime}
            />
          ) : (
            <p className="text-slate-soft">Prijavi se da vidiš podešavanja.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifikacije</CardTitle>
        </CardHeader>
        <CardContent>
          <PushToggle initialEnabled={hasPush} />
        </CardContent>
      </Card>

      {profile && status && (
        <AccountCard
          email={profile.email}
          status={status}
          vipUntilLabel={vipUntilLabel}
          refillUrl={refillUrl}
        />
      )}
    </div>
  )
}
