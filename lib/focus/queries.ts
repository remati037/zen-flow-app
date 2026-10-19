import 'server-only'

import { sql } from 'drizzle-orm'

import type { Profile } from '@/lib/auth'
import { BELGRADE_TZ, addDaysIso, belgradeToday } from '@/lib/dates'
import { db, focusSessions, protocolLogs } from '@/lib/db'
import { computeFocusTrend, SERIES_MAX_DAYS, type FocusTrend } from '@/lib/focus/score'

/**
 * Zona kao SQL literal, ne bind parametar: isti izraz stoji u `select` i
 * `group by` (vidi CLAUDE.md, „GROUP BY nad izrazom NIKAD ne sme da nosi bind
 * parametar"). Konstanta je naša, nikad korisnički unos.
 */
const tz = sql.raw(`'${BELGRADE_TZ}'`)

/**
 * Podaci za Focus Score grafikon: uzete doze i fokus minuti po beogradskom danu,
 * od početka protokola (najviše `SERIES_MAX_DAYS` + 7 dana unazad, zbog prozora
 * prakse). Dva agregata u bazi; model je u `lib/focus/score.ts`.
 */
export async function getFocusTrend(profile: Profile): Promise<FocusTrend> {
  const today = belgradeToday()
  const since = addDaysIso(today, -(SERIES_MAX_DAYS + 7))

  const [taken, focus] = await Promise.all([
    db.execute<{ day: string; taken: number }>(sql`
      select ${protocolLogs.date}::text as day, count(*)::int as taken
      from ${protocolLogs}
      where ${protocolLogs.userId} = ${profile.id}
        and ${protocolLogs.status} = 'taken'
        and ${protocolLogs.date} >= ${since}::date
      group by ${protocolLogs.date}
    `),
    db.execute<{ day: string; minutes: number }>(sql`
      select (${focusSessions.startedAt} at time zone ${tz})::date::text as day,
             coalesce(sum(${focusSessions.durationMin}), 0)::int as minutes
      from ${focusSessions}
      where ${focusSessions.userId} = ${profile.id}
        and ${focusSessions.startedAt} >= ${since}::date - interval '1 day'
      group by (${focusSessions.startedAt} at time zone ${tz})::date
    `),
  ])

  return computeFocusTrend({
    baseline: profile.focusScoreBaseline,
    startDate: profile.protocolStartDate,
    today,
    takenByDay: new Map(taken.rows.map((r) => [r.day, Number(r.taken)])),
    focusMinByDay: new Map(focus.rows.map((r) => [r.day, Number(r.minutes)])),
  })
}
