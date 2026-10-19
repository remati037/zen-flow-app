import { DoseCheckin } from '@/components/protocol/dose-checkin'
import { StreakHeader } from '@/components/protocol/streak-header'
import { requireAppAccess } from '@/lib/access/app-gate'
import { belgradeToday } from '@/lib/dates'
import { getProtocolState } from '@/lib/protocol/queries'

export default async function ProtokolPage() {
  const { profile } = await requireAppAccess()

  const { streak, todayDoses, weekStrip } = await getProtocolState(profile)
  const today = belgradeToday()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Protokol</h1>
        <p className="text-slate-mid">Označi doze i gradi svoj niz iz dana u dan.</p>
      </header>

      <StreakHeader streak={streak} weekStrip={weekStrip} />

      <DoseCheckin
        today={today}
        doses={todayDoses}
        morningTime={profile.doseMorningTime}
        eveningTime={profile.doseEveningTime}
      />
    </div>
  )
}
