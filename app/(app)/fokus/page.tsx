import { redirect } from 'next/navigation'
import { and, asc, count, eq, gte, sql } from 'drizzle-orm'

import { DailyTasks } from '@/components/focus/daily-tasks'
import { PomodoroTimer } from '@/components/focus/pomodoro-timer'
import { getCurrentProfile } from '@/lib/auth'
import { dailyTasks, db, focusSessions } from '@/lib/db'
import { belgradeDayStart, belgradeToday } from '@/lib/dates'

export default async function FokusPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/sign-in')

  const today = belgradeToday()
  const dayStart = belgradeDayStart()

  const [tasks, [stats]] = await Promise.all([
    db
      .select({ id: dailyTasks.id, title: dailyTasks.title, done: dailyTasks.done })
      .from(dailyTasks)
      .where(and(eq(dailyTasks.userId, profile.id), eq(dailyTasks.date, today)))
      .orderBy(asc(dailyTasks.id)),
    db
      .select({
        sessions: count(),
        minutes: sql<number>`coalesce(sum(${focusSessions.durationMin}), 0)::int`,
      })
      .from(focusSessions)
      .where(and(eq(focusSessions.userId, profile.id), gte(focusSessions.startedAt, dayStart))),
  ])

  const sessions = stats?.sessions ?? 0
  const minutes = stats?.minutes ?? 0

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-medium text-ink">Fokus</h1>
        <p className="text-slate-mid">
          {sessions === 0
            ? 'Pomodoro timer za fokusirane blokove rada.'
            : `Danas: ${sessions} ${sessions === 1 ? 'sesija' : sessions < 5 ? 'sesije' : 'sesija'} · ${minutes} min`}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <PomodoroTimer tasks={tasks} />
        <DailyTasks tasks={tasks} />
      </div>
    </div>
  )
}
