import { NextResponse, type NextRequest } from 'next/server'

import { maintainAccessStatuses } from '@/lib/access/status'
import { requireCronAuth } from '@/lib/cron/auth'
import { CRON_JOBS } from '@/lib/cron/health'
import { recordCronRun } from '@/lib/cron/heartbeat'
import { EVENTS, logError, logInfo } from '@/lib/observability/log'

export const runtime = 'nodejs'

/**
 * Vercel Cron — dnevno održavanje access_status-a.
 * Gasi istekle VIP-ove (vip → inactive bez porudžbine u prozoru, izuzev admina)
 * i vraća VIP one koji ipak imaju skorašnju porudžbinu (zaštita od propuštenog webhook-a).
 * Zaštićen `CRON_SECRET`-om. Vidi vercel.json za raspored.
 *
 * Heartbeat se upisuje BEZ OBZIRA na ishod (i kad upit padne) — dnevni izveštaj
 * po njemu vidi da li je posao stao (`isDailyJobStale`).
 */
export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const startedAt = Date.now()
  try {
    const result = await maintainAccessStatuses()
    const body = { ...result, durationMs: Date.now() - startedAt }
    await recordCronRun(CRON_JOBS.refreshAccess, body)
    logInfo(EVENTS.cronRun, { job: CRON_JOBS.refreshAccess, ...body })
    return NextResponse.json(body)
  } catch (err) {
    logError(EVENTS.cronRun, err, { job: CRON_JOBS.refreshAccess })
    await recordCronRun(CRON_JOBS.refreshAccess, { ok: false, durationMs: Date.now() - startedAt })
    return NextResponse.json({ error: 'refresh-access failed' }, { status: 500 })
  }
}
