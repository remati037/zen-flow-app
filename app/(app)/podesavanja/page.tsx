import { eq } from 'drizzle-orm'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PushToggle } from '@/components/push/push-toggle'
import { SettingsForm } from '@/components/settings/settings-form'
import { getCurrentProfile } from '@/lib/auth'
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
    </div>
  )
}
