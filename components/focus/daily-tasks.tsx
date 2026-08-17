'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { addTask, deleteTask, toggleTask } from '@/app/(app)/fokus/actions'
import type { FocusTask } from '@/components/focus/pomodoro-timer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
// Ista konstanta koju akcija enforce-uje — UI je samo prikaz, akcija je autoritet.
import { MAX_DAILY_TASKS as MAX_TASKS } from '@/lib/validations/focus'

export function DailyTasks({ tasks }: { tasks: FocusTask[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Lokalna kopija za optimistički prikaz; server je izvor istine posle refresh-a.
  const [items, setItems] = useState<FocusTask[]>(tasks)
  const [title, setTitle] = useState('')

  // Sinhronizacija kad server vrati nove podatke (npr. posle router.refresh()).
  const [seed, setSeed] = useState(tasks)
  if (seed !== tasks) {
    setSeed(tasks)
    setItems(tasks)
  }

  const full = items.length >= MAX_TASKS

  function submit() {
    const value = title.trim()
    if (!value) return
    if (full) {
      toast.error(`Maksimalno ${MAX_TASKS} zadatka dnevno.`)
      return
    }

    startTransition(async () => {
      const result = await addTask({ title: value })
      if (result.ok) {
        setTitle('')
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function toggle(task: FocusTask) {
    const next = !task.done
    setItems((s) => s.map((t) => (t.id === task.id ? { ...t, done: next } : t)))

    startTransition(async () => {
      const result = await toggleTask({ id: task.id })
      if (result.ok) {
        if (next) toast.success('Zadatak završen 🌿')
        router.refresh()
      } else {
        setItems((s) => s.map((t) => (t.id === task.id ? { ...t, done: task.done } : t))) // revert
        toast.error(result.error)
      }
    })
  }

  function remove(task: FocusTask) {
    setItems((s) => s.filter((t) => t.id !== task.id))

    startTransition(async () => {
      const result = await deleteTask({ id: task.id })
      if (result.ok) {
        router.refresh()
      } else {
        setItems(tasks) // revert
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-lg font-medium text-ink">Tri zadatka za danas</h2>
        <span className="text-sm tabular-nums text-slate-soft">
          {items.filter((t) => t.done).length}/{MAX_TASKS}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-mid">
        Ne više od tri — fokus je izbor, ne lista. Resetuje se svakog dana.
      </p>

      <ul className="mt-4 space-y-2">
        {items.map((task) => (
          <li
            key={task.id}
            className="flex items-center gap-3 rounded-lg bg-paper p-3 transition-colors"
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={task.done}
              aria-label={task.title}
              onClick={() => toggle(task)}
              disabled={isPending}
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full ring-1 transition-all',
                'disabled:opacity-60',
                task.done
                  ? 'bg-lime text-ink ring-lime'
                  : 'bg-white text-transparent ring-foreground/15 hover:ring-foreground/30',
              )}
            >
              <Check className="size-4" />
            </button>

            <span
              className={cn(
                'min-w-0 flex-1 wrap-break-word text-sm transition-colors',
                task.done ? 'text-slate-soft line-through' : 'text-ink',
              )}
            >
              {task.title}
            </span>

            <button
              type="button"
              onClick={() => remove(task)}
              disabled={isPending}
              aria-label={`Obriši zadatak: ${task.title}`}
              className="shrink-0 rounded-md p-1.5 text-slate-soft transition-colors hover:bg-white hover:text-ink disabled:opacity-60"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}

        {/* Prazni slotovi — vizuelno drže obećanje "tri, ne više". */}
        {Array.from({ length: Math.max(0, MAX_TASKS - items.length) }).map((_, i) => (
          <li
            key={`slot-${i}`}
            className="rounded-lg border border-dashed border-border p-3 text-sm text-slate-soft"
          >
            Slobodan slot
          </li>
        ))}
      </ul>

      {!full && (
        <div className="mt-4 flex items-center gap-2">
          <Input
            value={title}
            maxLength={120}
            placeholder="Dodaj zadatak…"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
          <Button variant="dark" onClick={submit} disabled={isPending || !title.trim()}>
            <Plus className="size-4" />
            Dodaj
          </Button>
        </div>
      )}
    </div>
  )
}
