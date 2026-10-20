import { and, count, desc, eq, gte, sql } from 'drizzle-orm'

import { FocusScoreCard } from '@/components/dashboard/focus-score-card'
import { GreetingHeader } from '@/components/dashboard/greeting-header'
import { OverviewList } from '@/components/dashboard/overview-list'
import { ProtocolCtaCard } from '@/components/dashboard/protocol-cta-card'
import { StackConfirmCard } from '@/components/stack/stack-confirm-card'
import { requireAppAccess } from '@/lib/access/app-gate'
import { badges, db, focusSessions, supply } from '@/lib/db'
import { belgradeDayStart, belgradeToday } from '@/lib/dates'
import { getFocusTrend } from '@/lib/focus/queries'
import { getProtocolState } from '@/lib/protocol/queries'
import { refillUrl as refillLink } from '@/lib/refill'
import { needsConfirmation } from '@/lib/supplements/confirm-rules'
import { getStackSummary } from '@/lib/supplements/store'

/**
 * Početna: agregacija svih feature-a Faze 1 na jednom ekranu. Svaki podatak
 * dolazi iz postojećih upita (`getProtocolState`, zalihe, fokus statistika,
 * bedževi) i učitava se paralelno na serveru — nema client fetch-a.
 * `logDose` radi `revalidatePath('/dashboard')`, pa check-in odavde osvežava
 * streak, zalihe i bedževe bez navigacije.
 */
export default async function DashboardPage() {
  const { profile } = await requireAppAccess()

  const today = belgradeToday()
  const dayStart = belgradeDayStart()

  const [protocol, supplyRows, focusRows, badgeRows, focusTrend, stackSummary] = await Promise.all([
    getProtocolState(profile),
    db
      .select({
        capsulesRemaining: supply.capsulesRemaining,
        estimatedRunoutDate: supply.estimatedRunoutDate,
      })
      .from(supply)
      .where(eq(supply.userId, profile.id))
      .limit(1),
    db
      .select({
        sessions: count(),
        minutes: sql<number>`coalesce(sum(${focusSessions.durationMin}), 0)::int`,
      })
      .from(focusSessions)
      .where(and(eq(focusSessions.userId, profile.id), gte(focusSessions.startedAt, dayStart))),
    // Max 9 redova (veličina kataloga) — sortiranje ide u SQL-u da red bedževa
    // bude deterministički i kad je više njih dodeljeno u istoj akciji.
    db
      .select({ badgeKey: badges.badgeKey, earnedAt: badges.earnedAt })
      .from(badges)
      .where(eq(badges.userId, profile.id))
      .orderBy(desc(badges.earnedAt), desc(badges.id)),
    getFocusTrend(profile),
    getStackSummary(profile.id),
  ])

  const { streak, todayDoses } = protocol
  const supplyRow = supplyRows[0]
  const focusStats = focusRows[0]
  const refillUrl = refillLink('dashboard')
  const stackNeedsConfirm = needsConfirmation(stackSummary.oldestConfirmedOn, today)

  return (
    <div className="space-y-5">
      <GreetingHeader
        name={profile.name}
        protocolStartDate={profile.protocolStartDate}
        today={today}
      />

      <ProtocolCtaCard
        today={today}
        doses={todayDoses}
        streak={streak}
        morningTime={profile.doseMorningTime}
        eveningTime={profile.doseEveningTime}
      />

      <FocusScoreCard trend={focusTrend} />

      {stackNeedsConfirm && <StackConfirmCard />}

      <OverviewList
        capsulesRemaining={supplyRow?.capsulesRemaining ?? 0}
        estimatedRunoutDate={supplyRow?.estimatedRunoutDate ?? null}
        refillUrl={refillUrl}
        stackCount={stackSummary.activeCount}
        stackNeedsConfirm={stackNeedsConfirm}
        focusSessions={focusStats?.sessions ?? 0}
        focusMinutes={focusStats?.minutes ?? 0}
        earnedBadgeKeys={badgeRows.map((b) => b.badgeKey)}
      />


    </div>
  )
}
