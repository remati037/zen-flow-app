import { z } from 'zod'

/**
 * Snimanje jednog Pomodoro bloka. `completed: false` znači da je korisnik
 * prekinuo sesiju pre isteka — i takva se beleži, sa stvarno proteklim vremenom.
 * `taskLabel` je snapshot naslova zadatka (ne FK) — zadatak se briše po danu,
 * a sesija treba da ostane čitljiva u istoriji.
 */
export const saveFocusSessionSchema = z.object({
  durationMin: z.coerce.number().int().min(1).max(120),
  completed: z.boolean(),
  taskLabel: z.string().trim().max(120).optional(),
})

export type SaveFocusSessionInput = z.infer<typeof saveFocusSessionSchema>

/**
 * Koliko zadataka korisnik sme da ima po danu (fokus = izbor, ne todo lista).
 * Živi ovde, a ne u `actions.ts` — 'use server' fajl sme da izvozi samo async funkcije,
 * a i UI i akcija čitaju istu konstantu.
 */
export const MAX_DAILY_TASKS = 3

/** Novi zadatak za današnji dan. Limit od 3 dnevno se proverava u akciji, ne ovde. */
export const addTaskSchema = z.object({
  title: z.string().trim().min(1, 'Unesi naslov zadatka.').max(120),
})

export type AddTaskInput = z.infer<typeof addTaskSchema>

/** `serial` primarni ključ iz `daily_tasks`. */
const taskId = z.coerce.number().int().positive()

export const toggleTaskSchema = z.object({ id: taskId })
export const deleteTaskSchema = z.object({ id: taskId })

export type ToggleTaskInput = z.infer<typeof toggleTaskSchema>
export type DeleteTaskInput = z.infer<typeof deleteTaskSchema>
