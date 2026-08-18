import { redirect } from 'next/navigation'
import { and, count, desc, eq, gte, sql } from 'drizzle-orm'

import { AdherenceChart } from '@/components/dashboard/adherence-chart'
import { FocusMiniCard } from '@/components/dashboard/focus-mini-card'
import { GreetingHeader } from '@/components/dashboard/greeting-header'
import { ProtocolCtaCard } from '@/components/dashboard/protocol-cta-card'
import { RecentBadgesRow } from '@/components/dashboard/recent-badges-row'
import { SupplyMiniCard } from '@/components/dashboard/supply-mini-card'
import { getCurrentProfile } from '@/lib/auth'
import { badges, db, focusSessions, supply } from '@/lib/db'
import { belgradeDayStart, belgradeToday } from '@/lib/dates'
import { getProtocolState } from '@/lib/protocol/queries'

/** Dužina prozora na grafikonu doslednosti = dužina stripa koji traži od upita. */
const ADHERENCE_DAYS = 14

/**
 * Početna: agregacija svih feature-a Faze 1 na jednom ekranu. Svaki podatak
 * dolazi iz postojećih upita (`getProtocolState`, zalihe, fokus statistika,
 * bedževi) i učitava se paralelno na serveru — nema client fetch-a.
 * `logDose` radi `revalidatePath('/dashboard')`, pa check-in odavde osvežava
 * streak, zalihe i bedževe bez navigacije.
 */
export default async function DashboardPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/sign-in')

  const today = belgradeToday()
  const dayStart = belgradeDayStart()

  const [protocol, supplyRows, focusRows, badgeRows] = await Promise.all([
    getProtocolState(profile, { stripDays: ADHERENCE_DAYS }),
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
  ])

  const { streak, todayDoses, weekStrip: adherenceDays } = protocol
  const supplyRow = supplyRows[0]
  const focusStats = focusRows[0]
  const refillUrl = process.env.NEXT_PUBLIC_SHOP_REFILL_URL ?? null

  return (
    <div className="space-y-4">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <SupplyMiniCard
          capsulesRemaining={supplyRow?.capsulesRemaining ?? 0}
          estimatedRunoutDate={supplyRow?.estimatedRunoutDate ?? null}
          refillUrl={refillUrl}
        />
        <FocusMiniCard
          sessions={focusStats?.sessions ?? 0}
          minutes={focusStats?.minutes ?? 0}
        />
      </div>

      <AdherenceChart days={adherenceDays} />

      <RecentBadgesRow earned={badgeRows} />
    </div>
  )
}
