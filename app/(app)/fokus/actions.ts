'use server'

import { revalidatePath } from 'next/cache'
import { and, count, eq, sql } from 'drizzle-orm'

import { createAction } from '@/lib/actions/safe-action'
import { dailyTasks, db, focusSessions } from '@/lib/db'
import { belgradeToday } from '@/lib/dates'
import {
  MAX_DAILY_TASKS,
  addTaskSchema,
  deleteTaskSchema,
  saveFocusSessionSchema,
  toggleTaskSchema,
} from '@/lib/validations/focus'

/**
 * Beleži završen ili prekinut Pomodoro blok.
 *
 * `startedAt` se izvodi unazad iz trajanja (akcija se zove na kraju sesije), pa je
 * red konzistentan sa imenom kolone i statistika po danu pada na dan kad je sesija
 * stvarno počela.
 */
export const saveFocusSession = createAction(saveFocusSessionSchema, async (data, { profile }) => {
  const startedAt = new Date(Date.now() - data.durationMin * 60_000)

  await db.insert(focusSessions).values({
    userId: profile.id,
    startedAt,
    durationMin: data.durationMin,
    completed: data.completed,
    taskLabel: data.taskLabel?.length ? data.taskLabel : null,
  })

  revalidatePath('/fokus')
  revalidatePath('/dashboard')

  // newBadges ostaje prazan do koraka 1.11 (award engine).
  return { durationMin: data.durationMin, newBadges: [] as string[] }
})

/**
 * Dodaje zadatak za današnji beogradski dan.
 * Limit se proverava OVDE (count pre inserta) — UI blokada nije sigurnosna granica.
 */
export const addTask = createAction(addTaskSchema, async (data, { profile }) => {
  const date = belgradeToday()

  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(dailyTasks)
    .where(and(eq(dailyTasks.userId, profile.id), eq(dailyTasks.date, date)))

  if (existing >= MAX_DAILY_TASKS) {
    throw new Error(`Maksimalno ${MAX_DAILY_TASKS} zadatka dnevno — završi ili obriši neki.`)
  }

  const [task] = await db
    .insert(dailyTasks)
    .values({ userId: profile.id, date, title: data.title })
    .returning({ id: dailyTasks.id, title: dailyTasks.title, done: dailyTasks.done })

  revalidatePath('/fokus')

  return task
})

/**
 * Obrće `done` u jednom UPDATE-u. `where` uključuje `userId`, pa tuđi red nikad
 * ne bude pogođen — prazan `returning()` znači "ne postoji ili nije tvoj".
 */
export const toggleTask = createAction(toggleTaskSchema, async (data, { profile }) => {
  const [task] = await db
    .update(dailyTasks)
    .set({ done: sql`not ${dailyTasks.done}` })
    .where(and(eq(dailyTasks.id, data.id), eq(dailyTasks.userId, profile.id)))
    .returning({ id: dailyTasks.id, done: dailyTasks.done })

  if (!task) {
    throw new Error('Zadatak nije pronađen.')
  }

  revalidatePath('/fokus')

  return task
})

export const deleteTask = createAction(deleteTaskSchema, async (data, { profile }) => {
  const [task] = await db
    .delete(dailyTasks)
    .where(and(eq(dailyTasks.id, data.id), eq(dailyTasks.userId, profile.id)))
    .returning({ id: dailyTasks.id })

  if (!task) {
    throw new Error('Zadatak nije pronađen.')
  }

  revalidatePath('/fokus')

  return task
})
