import 'server-only'

import { eq, sql } from 'drizzle-orm'

import { cronRuns, db } from '@/lib/db'
import { EVENTS, logError } from '@/lib/observability/log'
import type { CronJob, DispatcherRun } from './health'

/**
 * Heartbeat zakazanih poslova — upiši da si POZVAN, bez obzira na ishod.
 *
 * Zašto ne izvodimo „poslednji run" iz `notifications_log`: run bez ijednog
 * kandidata ne upiše nijedan red, pa se „scheduler je mrtav" ne razlikuje od
 * „niko nije bio na redu". Ovo je jedini zapis koji postoji uvek.
 */

/**
 * Razmak od prethodnog run-a u minutima, računat nad ZAKLJUČANIM postojećim redom.
 *
 * `cron_runs.last_run_at` u `do update set` je stara vrednost (Postgres pravilo),
 * a `now()` je stabilan kroz celu izjavu — pa sve tri upotrebe daju isti broj.
 * `greatest(0, ...)` čuva od pomeranja sistemskog sata unazad.
 */
const GAP_MIN = sql`greatest(0, round(extract(epoch from (now() - ${cronRuns.lastRunAt})) / 60))::int`

type RecordedRun = {
  /** Minuta od prethodnog run-a; `null` za prvi run ikad. */
  gapMin: number | null
  maxGapMin: number | null
  runsTotal: number
}

/**
 * Upiše heartbeat u JEDNOJ SQL izjavi (neon-http nema `db.transaction()`).
 * Rupa se meri u SQL-u nad tekućom vrednošću reda, nikad nad ranije pročitanom —
 * isti obrazac kao upis check-ina u `app/(app)/protokol/actions.ts`.
 *
 * NIKAD ne baca: heartbeat je dijagnostika, i ne sme da obori run koji je upravo
 * uspešno poslao podsetnike.
 */
export async function recordCronRun(job: CronJob, result: unknown): Promise<RecordedRun | null> {
  try {
    const rows = await db.execute<{
      last_gap_min: number | null
      max_gap_min: number | null
      runs_total: number
    }>(sql`
      insert into ${cronRuns} ("job", "last_run_at", "runs_total", "last_result")
      values (${job}, now(), 1, ${JSON.stringify(result)}::jsonb)
      on conflict ("job") do update set
        "last_run_at" = now(),
        "last_gap_min" = ${GAP_MIN},
        "max_gap_min" = greatest(coalesce(${cronRuns.maxGapMin}, 0), ${GAP_MIN}),
        "max_gap_at" = case
          when ${GAP_MIN} > coalesce(${cronRuns.maxGapMin}, 0) then now()
          else ${cronRuns.maxGapAt}
        end,
        "runs_total" = ${cronRuns.runsTotal} + 1,
        "last_result" = excluded."last_result"
      returning "last_gap_min", "max_gap_min", "runs_total"
    `)

    const row = rows.rows[0]
    if (!row) return null
    return {
      gapMin: row.last_gap_min === null ? null : Number(row.last_gap_min),
      maxGapMin: row.max_gap_min === null ? null : Number(row.max_gap_min),
      runsTotal: Number(row.runs_total),
    }
  } catch (err) {
    logError(EVENTS.cronHeartbeatFailed, err, { job })
    return null
  }
}

/** Poslednji heartbeat posla, ili `null` ako posao nikad nije pozvan. */
export async function readCronRun(job: CronJob): Promise<(DispatcherRun & { lastResult: unknown }) | null> {
  const [row] = await db
    .select({
      lastRunAt: cronRuns.lastRunAt,
      lastGapMin: cronRuns.lastGapMin,
      maxGapMin: cronRuns.maxGapMin,
      maxGapAt: cronRuns.maxGapAt,
      runsTotal: cronRuns.runsTotal,
      lastResult: cronRuns.lastResult,
    })
    .from(cronRuns)
    .where(eq(cronRuns.job, job))
    .limit(1)

  return row ?? null
}
