import { NextResponse, type NextRequest } from 'next/server'

import { DELIVERY_SERIES_DAYS, getDeliveryReport } from '@/lib/admin/delivery'
import { requireCronAuth } from '@/lib/cron/auth'
import { CRON_JOBS, describeDispatcherHealth } from '@/lib/cron/health'
import { readCronRun, recordCronRun } from '@/lib/cron/heartbeat'
import { addDaysIso, belgradeToday } from '@/lib/dates'
import { EVENTS, logInfo, logWarn } from '@/lib/observability/log'
import { WINDOW_MIN } from '@/lib/push/dispatch-rules'

export const runtime = 'nodejs'

/**
 * Dnevni izveštaj o isporučenosti (O-M1).
 *
 * Zašto postoji, kad admin panel prikazuje isti agregat: panel se gleda kad neko
 * posumnja da nešto ne radi. Ovo je zapis koji nastaje SVAKI dan bez obzira da li
 * je iko gledao — jedan strukturni JSON red (`observability.daily_report`) koji se
 * može grep-ovati unazad kroz Vercel logove i, ako se ikad doda log drain ili
 * eksterni alert, direktno pretvoriti u alarm bez izmene koda.
 *
 * Meri JUČERAŠNJI beogradski dan, ne današnji: današnji je nepotpun dok traje, pa
 * bi „0 poslatih" u 00:30 bio lažna uzbuna svaki dan.
 *
 * Raspored: jednom dnevno (Vercel Cron, vidi `docs/cron-setup.md`). Kao i ostale
 * cron rute: `Authorization: Bearer CRON_SECRET` i heartbeat u `cron_runs`.
 */
export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const startedAt = Date.now()
  const yesterday = addDaysIso(belgradeToday(), -1)

  const [report, notificationsRun, lowStockRun] = await Promise.all([
    getDeliveryReport(DELIVERY_SERIES_DAYS),
    readCronRun(CRON_JOBS.notifications),
    readCronRun(CRON_JOBS.lowStock),
  ])

  const day = report.days.find((d) => d.date === yesterday) ?? {
    date: yesterday,
    push: { success: 0, failed: 0, pending: 0 },
    email: { success: 0, failed: 0, pending: 0 },
  }

  const dispatcher = describeDispatcherHealth({
    run: notificationsRun,
    now: new Date(),
    windowMin: WINDOW_MIN,
  })

  const body = {
    day: yesterday,
    delivery: {
      push: day.push,
      email: day.email,
      /** Nezatvorene rezervacije = potrošen dedup slot bez poslate poruke. */
      stuckPending: day.push.pending + day.email.pending,
    },
    window: {
      days: report.windowDays,
      totals: report.totals,
      successRate: report.successRate,
    },
    dispatcher: {
      status: dispatcher.status,
      sinceLastRunMin: dispatcher.sinceLastRunMin,
      maxGapMin: dispatcher.maxGapMin,
      runsTotal: dispatcher.runsTotal,
    },
    lowStockLastRunAt: lowStockRun?.lastRunAt.toISOString() ?? null,
    durationMs: Date.now() - startedAt,
  }

  // Jedan red po danu, ravna polja — da se filtrira i grafikuje bez parsiranja teksta.
  logInfo(EVENTS.dailyReport, {
    day: body.day,
    pushSuccess: day.push.success,
    pushFailed: day.push.failed,
    emailSuccess: day.email.success,
    emailFailed: day.email.failed,
    stuckPending: body.delivery.stuckPending,
    successRate: report.successRate,
    dispatcherStatus: dispatcher.status,
  })

  // Odvojen WARN red za stanja koja traže reakciju — da alert ne zavisi od toga
  // da li neko svakodnevno čita info redove.
  if (dispatcher.status !== 'ok') {
    logWarn(EVENTS.dailyReport, { day: body.day, problem: 'dispatcher', status: dispatcher.status })
  }
  if (body.delivery.stuckPending > 0) {
    logWarn(EVENTS.dailyReport, {
      day: body.day,
      problem: 'stuck_pending',
      count: body.delivery.stuckPending,
    })
  }
  if (day.push.failed > 0 || day.email.failed > 0) {
    logWarn(EVENTS.dailyReport, {
      day: body.day,
      problem: 'delivery_failures',
      pushFailed: day.push.failed,
      emailFailed: day.email.failed,
    })
  }

  await recordCronRun(CRON_JOBS.dailyReport, body)

  return NextResponse.json(body)
}
