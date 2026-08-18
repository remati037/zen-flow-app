'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Coffee, Pause, Play, Square, Target } from 'lucide-react'
import { toast } from 'sonner'

import { saveFocusSession } from '@/app/(app)/fokus/actions'
import { celebrateNewBadges } from '@/components/badges/badge-toast'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PresetKey = '25-5' | '50-10'
type Mode = 'work' | 'break'

const PRESETS: Record<PresetKey, { label: string; workMin: number; breakMin: number }> = {
  '25-5': { label: '25 / 5', workMin: 25, breakMin: 5 },
  '50-10': { label: '50 / 10', workMin: 50, breakMin: 10 },
}

const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[]

/** localStorage ključ — refresh usred sesije nastavlja odbrojavanje. */
const STORAGE_KEY = 'zenflow.pomodoro'

type Persisted = {
  presetKey: PresetKey
  mode: Mode
  endsAt: number | null
  pausedMs: number | null
  taskLabel: string | null
}

/** SVG ring geometrija (viewBox 120×120). */
const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Kratak dvotonski beep preko WebAudio — bez eksternog audio fajla.
 * AudioContext se pravi na klik "Pokreni" (user gesture), inače ga browser blokira.
 */
function playBeep(ctx: AudioContext) {
  void ctx.resume()
  const start = ctx.currentTime + 0.02
  for (const [i, offset] of [0, 0.28].entries()) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = i === 0 ? 880 : 1175
    gain.gain.setValueAtTime(0.0001, start + offset)
    gain.gain.exponentialRampToValueAtTime(0.2, start + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.24)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start + offset)
    osc.stop(start + offset + 0.26)
  }
}

export type FocusTask = { id: number; title: string; done: boolean }

export function PomodoroTimer({ tasks }: { tasks: FocusTask[] }) {
  const router = useRouter()
  const [, startSaving] = useTransition()

  const [presetKey, setPresetKey] = useState<PresetKey>('25-5')
  const [mode, setMode] = useState<Mode>('work')
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [pausedMs, setPausedMs] = useState<number | null>(null)
  /** Preostalo dok odbrojavanje ide; van toga se prikaz izvodi iz preseta. */
  const [tickMs, setTickMs] = useState(0)
  const [taskLabel, setTaskLabel] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)

  const audioRef = useRef<AudioContext | null>(null)
  const titleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const preset = PRESETS[presetKey]
  const totalMs = (mode === 'work' ? preset.workMin : preset.breakMin) * 60_000
  const running = endsAt !== null
  const paused = pausedMs !== null
  const idle = !running && !paused
  const displayMs = running ? tickMs : (pausedMs ?? totalMs)

  const persistSession = useCallback(
    (durationMin: number, completed: boolean, label: string | null) => {
      startSaving(async () => {
        const result = await saveFocusSession({
          durationMin,
          completed,
          taskLabel: label ?? undefined,
        })
        if (result.ok) {
          celebrateNewBadges(result.data.newBadges)
          router.refresh()
        } else {
          toast.error(result.error)
        }
      })
    },
    [router],
  )

  /** Trepćući naslov taba — signal kad je korisnik u drugom tabu. */
  const flashTitle = useCallback((text: string) => {
    if (titleTimerRef.current) clearInterval(titleTimerRef.current)
    const original = document.title
    let ticks = 0
    titleTimerRef.current = setInterval(() => {
      document.title = ticks % 2 === 0 ? text : original
      ticks += 1
      if (ticks > 12) {
        clearInterval(titleTimerRef.current!)
        titleTimerRef.current = null
        document.title = original
      }
    }, 900)
  }, [])

  // Povratak u tab gasi treptanje naslova; cleanup vraća originalni naslov.
  useEffect(() => {
    const stopFlash = () => {
      if (titleTimerRef.current) {
        clearInterval(titleTimerRef.current)
        titleTimerRef.current = null
      }
    }
    window.addEventListener('focus', stopFlash)
    return () => {
      window.removeEventListener('focus', stopFlash)
      stopFlash()
    }
  }, [])

  // ── Restore iz localStorage ────────────────────────────────────────
  // localStorage ne postoji tokom SSR-a, pa se stanje mora podići posle mount-a;
  // efekat radi tačno jednom (prazne zavisnosti) i ne ulancava rendere.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const s = raw ? (JSON.parse(raw) as Partial<Persisted>) : null
      const key = s?.presetKey && s.presetKey in PRESETS ? s.presetKey : null

      if (s && key) {
        const p = PRESETS[key]
        const savedMode: Mode = s.mode === 'break' ? 'break' : 'work'
        const label = typeof s.taskLabel === 'string' ? s.taskLabel : null
        setPresetKey(key)
        setTaskLabel(label)
        setMode(savedMode)

        if (typeof s.endsAt === 'number' && s.endsAt > Date.now()) {
          setTickMs(s.endsAt - Date.now())
          setEndsAt(s.endsAt)
        } else if (typeof s.endsAt === 'number') {
          // Blok je istekao dok je tab bio zatvoren — zabeleži ga i pređi dalje.
          if (savedMode === 'work') {
            persistSession(p.workMin, true, label)
            setMode('break')
            toast.success(`Blok od ${p.workMin} min je završen u međuvremenu.`)
          } else {
            setMode('work')
          }
        } else if (typeof s.pausedMs === 'number') {
          setPausedMs(s.pausedMs)
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }

    setRestored(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only restore
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Upis u localStorage ────────────────────────────────────────────
  useEffect(() => {
    if (!restored) return
    if (idle) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    const state: Persisted = { presetKey, mode, endsAt, pausedMs, taskLabel }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [restored, idle, presetKey, mode, endsAt, pausedMs, taskLabel])

  /** Kraj bloka: rad → snima sesiju i prelazi u pauzu, pauza → nazad u rad. */
  const finish = useCallback(() => {
    setEndsAt(null)
    setPausedMs(null)

    if (audioRef.current) playBeep(audioRef.current)

    if (mode === 'work') {
      persistSession(preset.workMin, true, taskLabel)
      setMode('break')
      flashTitle('⏰ Blok gotov!')
      toast.success(`Blok od ${preset.workMin} min je gotov 🌿 Pauza: ${preset.breakMin} min.`)
    } else {
      setMode('work')
      flashTitle('⏰ Pauza gotova!')
      toast('Pauza je gotova — nazad u fokus.')
    }
  }, [flashTitle, mode, persistSession, preset, taskLabel])

  // Ref da tick interval uvek zove svežu verziju, bez restartovanja odbrojavanja.
  const finishRef = useRef(finish)
  useEffect(() => {
    finishRef.current = finish
  }, [finish])

  // ── Tick: preostalo se IZVODI iz `endsAt`, ne dekrementira ─────────
  // Zato throttling neaktivnog taba (i sleep uređaja) ne pomera odbrojavanje.
  useEffect(() => {
    if (endsAt === null) return

    let done = false
    const tick = () => {
      const left = endsAt - Date.now()
      setTickMs(Math.max(0, left))
      if (left <= 0 && !done) {
        done = true
        finishRef.current()
      }
    }
    const id = setInterval(tick, 250)

    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [endsAt])

  function start() {
    // AudioContext mora da nastane iz user gesture-a da bi beep na kraju prošao.
    if (!audioRef.current && typeof window !== 'undefined') {
      const Ctor =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor) audioRef.current = new Ctor()
    }
    void audioRef.current?.resume()

    const ms = pausedMs ?? totalMs
    setTickMs(ms)
    setPausedMs(null)
    setEndsAt(Date.now() + ms)
  }

  function pause() {
    if (endsAt === null) return
    setPausedMs(Math.max(0, endsAt - Date.now()))
    setEndsAt(null)
  }

  function stop() {
    const left = endsAt !== null ? Math.max(0, endsAt - Date.now()) : (pausedMs ?? totalMs)
    const elapsedMin = Math.round((totalMs - left) / 60_000)

    setEndsAt(null)
    setPausedMs(null)
    setMode('work')

    if (mode === 'work' && elapsedMin >= 1) {
      persistSession(elapsedMin, false, taskLabel)
      toast(`Sesija prekinuta — zabeleženo ${elapsedMin} min.`)
    } else {
      toast('Sesija je poništena.')
    }
  }

  const progress = totalMs > 0 ? Math.min(1, Math.max(0, displayMs / totalMs)) : 0
  const isBreak = mode === 'break'

  return (
    <div className="rounded-xl bg-white p-6 shadow-soft ring-1 ring-foreground/10">
      {/* Preseti */}
      <div className="flex items-center justify-center gap-2">
        {PRESET_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPresetKey(key)}
            disabled={!idle}
            aria-pressed={presetKey === key}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition-all',
              'disabled:cursor-not-allowed disabled:opacity-50',
              presetKey === key
                ? 'bg-ink text-paper ring-ink'
                : 'bg-paper text-slate-mid ring-transparent hover:ring-foreground/15',
            )}
          >
            {PRESETS[key].label}
          </button>
        ))}
      </div>

      {/* Ring + brojač */}
      <div className="mt-6 flex justify-center">
        <div className="relative size-60">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90">
            <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="8" className="stroke-paper" />
            <circle
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              className={cn(
                'transition-[stroke-dashoffset] duration-300 ease-linear',
                isBreak ? 'stroke-mint' : 'stroke-lime',
              )}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-mid">
              {isBreak ? <Coffee className="size-4" /> : <Target className="size-4" />}
              {isBreak ? 'Pauza' : 'Fokus'}
            </span>
            <span className="font-heading text-5xl font-semibold tabular-nums text-ink">
              {formatClock(displayMs)}
            </span>
            {taskLabel && !isBreak && (
              <span className="max-w-40 truncate text-sm text-slate-soft">{taskLabel}</span>
            )}
          </div>
        </div>
      </div>

      {/* Kontrole */}
      <div className="mt-6 flex items-center justify-center gap-2">
        {running ? (
          <Button variant="outline" size="lg" onClick={pause}>
            <Pause className="size-4" />
            Pauziraj
          </Button>
        ) : (
          <Button variant="lime" size="lg" onClick={start}>
            <Play className="size-4" />
            {paused ? 'Nastavi' : isBreak ? 'Pokreni pauzu' : 'Pokreni fokus'}
          </Button>
        )}

        {!idle && (
          <Button variant="ghost" size="lg" onClick={stop}>
            <Square className="size-4" />
            Prekini
          </Button>
        )}
      </div>

      {/* Vezivanje za današnji zadatak */}
      {tasks.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="text-sm text-slate-mid">Na čemu radiš?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTaskLabel(null)}
              aria-pressed={taskLabel === null}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm ring-1 transition-all',
                taskLabel === null
                  ? 'bg-lime text-ink ring-lime'
                  : 'bg-paper text-slate-mid ring-transparent hover:ring-foreground/15',
              )}
            >
              Bez zadatka
            </button>
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setTaskLabel(task.title)}
                aria-pressed={taskLabel === task.title}
                className={cn(
                  'max-w-full truncate rounded-full px-3 py-1.5 text-sm ring-1 transition-all',
                  taskLabel === task.title
                    ? 'bg-lime text-ink ring-lime'
                    : 'bg-paper text-slate-mid ring-transparent hover:ring-foreground/15',
                )}
              >
                {task.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
