import { eq } from 'drizzle-orm'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PushTestButton } from '@/components/push/push-test-button'
import { PushToggle } from '@/components/push/push-toggle'
import { getCurrentProfile } from '@/lib/auth'
import { db, pushSubscriptions } from '@/lib/db'

export default async function AdminPage() {
  const profile = await getCurrentProfile()

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
        <h1 className="text-2xl font-medium text-ink">Pregled</h1>
        <p className="text-slate-mid">Metrike i upravljanje korisnicima.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Test push notifikacije</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PushToggle initialEnabled={hasPush} />
          <div className="border-t border-border pt-4">
            <p className="mb-3 text-sm text-muted-foreground">
              Uključi podsetnike na ovom uređaju, pa pošalji probnu notifikaciju sebi.
            </p>
            <PushTestButton />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-12 text-center text-slate-soft">
          Uskoro — admin metrike i prečice.
        </CardContent>
      </Card>
    </div>
  )
}
