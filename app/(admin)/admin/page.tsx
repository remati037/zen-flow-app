import { eq } from 'drizzle-orm'
import { Activity, BellRing, Flame, Package, ShoppingBag, Smartphone, UserX, Users } from 'lucide-react'

import { CheckinsChart } from '@/components/admin/checkins-chart'
import { MetricCard } from '@/components/admin/metric-card'
import { PushTestButton } from '@/components/push/push-test-button'
import { PushToggle } from '@/components/push/push-toggle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  NOTIFICATIONS_WINDOW_DAYS,
  ORDERS_WINDOW_DAYS,
  getAdminMetrics,
} from '@/lib/admin/metrics'
import { getCurrentProfile } from '@/lib/auth'
import { db, pushSubscriptions } from '@/lib/db'
import { pluralSr } from '@/lib/format'

export default async function AdminPage() {
  const profile = await getCurrentProfile()

  const [metrics, ownSubs] = await Promise.all([
    getAdminMetrics(),
    profile
      ? db
          .select({ id: pushSubscriptions.id })
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, profile.id))
          .limit(1)
      : Promise.resolve([]),
  ])

  const hasPush = ownSubs.length > 0

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Pregled</h1>
        <p className="text-slate-mid">Metrike i upravljanje korisnicima.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Korisnici"
          value={metrics.users.total}
          hint={`${metrics.users.subscriber} ${pluralSr(metrics.users.subscriber, 'pretplatnik', 'pretplatnika', 'pretplatnika')}`}
          icon={Users}
        />
        <MetricCard label="VIP" value={metrics.users.vip} hint="aktivan pristup" icon={Package} />
        <MetricCard
          label="Neaktivni"
          value={metrics.users.inactive}
          hint="bez pristupa app-u"
          icon={UserX}
        />
        <MetricCard
          label={`Porudžbine ${ORDERS_WINDOW_DAYS}d`}
          value={metrics.ordersLast30d}
          hint="sinhronizovano iz Woo-a"
          icon={ShoppingBag}
        />

        <MetricCard
          label="Check-inovi danas"
          value={metrics.checkinsToday.doses}
          hint={`${metrics.checkinsToday.users} ${pluralSr(metrics.checkinsToday.users, 'korisnik', 'korisnika', 'korisnika')}`}
          icon={Activity}
          accent
        />
        <MetricCard
          label="Prosečan streak"
          value={metrics.averageStreak}
          hint={`${metrics.streakUserCount} sa započetim protokolom`}
          icon={Flame}
        />
        <MetricCard
          label="Push pretplate"
          value={metrics.pushSubscriptions}
          hint="uređaja ukupno"
          icon={Smartphone}
        />
        <MetricCard
          label={`Notifikacije ${NOTIFICATIONS_WINDOW_DAYS}d`}
          value={metrics.notificationsLast7d.total}
          hint={
            metrics.notificationsLast7d.failed > 0
              ? `${metrics.notificationsLast7d.failed} neuspešnih`
              : 'sve uspešne'
          }
          icon={BellRing}
        />
      </div>

      <CheckinsChart data={metrics.dailyCheckins} />

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
    </div>
  )
}
