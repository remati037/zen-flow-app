'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CAPSULES_PER_PACKAGE, estimateDaysRemaining, estimateRunoutDate } from '@/lib/protocol/dosing'
import {
  FOCUS_QUIZ_LENGTH,
  FOCUS_QUIZ_QUESTIONS,
  FOCUS_QUIZ_SCALE_LABELS,
} from '@/lib/quiz/focus-quiz'
import { completeOnboarding } from './actions'

const TOTAL_STEPS = 4

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDateSr(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('sr-RS', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function OnboardingWizard({ defaultPackages }: { defaultPackages: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [step, setStep] = useState(1)
  const [packages, setPackages] = useState(String(defaultPackages))
  const [startDate, setStartDate] = useState(todayIso())
  const [doseMorningTime, setDoseMorningTime] = useState('08:00')
  const [doseEveningTime, setDoseEveningTime] = useState('20:00')
  const [quizAnswers, setQuizAnswers] = useState<(number | null)[]>(
    Array(FOCUS_QUIZ_LENGTH).fill(null),
  )
  const [notifAsked, setNotifAsked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const packagesNum = Math.max(1, Number.parseInt(packages, 10) || 1)
  const capsules = packagesNum * CAPSULES_PER_PACKAGE

  const estimate = useMemo(() => {
    const days = estimateDaysRemaining(capsules)
    const runout = estimateRunoutDate(new Date(startDate), capsules)
    return { days, runoutLabel: formatDateSr(runout) }
  }, [capsules, startDate])

  const quizComplete = quizAnswers.every((a) => a !== null)

  function next() {
    setError(null)
    setStep((s) => Math.min(TOTAL_STEPS, s + 1))
  }
  function back() {
    setError(null)
    setStep((s) => Math.max(1, s - 1))
  }

  async function requestNotifications() {
    setNotifAsked(true)
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
    } catch {
      // Best-effort — dozvola nije obavezna za nastavak (push subscribe ide u Koraku 1.7).
    }
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await completeOnboarding({
        packages: packagesNum,
        startDate,
        doseMorningTime,
        doseEveningTime,
        quizAnswers,
      })
      if (result.ok) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Card className="w-full max-w-md shadow-soft" size="default">
      <CardHeader>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          ZenFlow · Korak {step}/{TOTAL_STEPS}
        </p>
        <CardTitle className="text-lg">
          {step === 1 && 'Postavi svoj protokol'}
          {step === 2 && 'Vreme doza'}
          {step === 3 && 'Focus Score — početno stanje'}
          {step === 4 && 'Podsetnici i kraj'}
        </CardTitle>
        <CardDescription>
          {step === 1 && 'Koliko pakovanja imaš i kad počinješ — računamo kada ti ističu zalihe.'}
          {step === 2 && 'Kad uzimaš jutarnju i večernju dozu? Po ovome šaljemo podsetnike.'}
          {step === 3 && 'Kratko stanje na startu — kasnije pratimo napredak. Nije medicinska procena.'}
          {step === 4 && 'Uključi podsetnike da ne prekineš niz, pa kreni.'}
        </CardDescription>
        <ProgressDots total={TOTAL_STEPS} current={step} />
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Broj pakovanja</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={packages}
                onChange={(e) => setPackages(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Datum početka</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <p className="text-muted-foreground">
                {capsules} kapsula · ≈ <strong className="text-foreground">{estimate.days} dana</strong>
              </p>
              {estimate.runoutLabel && (
                <p className="text-muted-foreground">
                  Zalihe ističu oko <strong className="text-foreground">{estimate.runoutLabel}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Jutarnja doza</span>
              <Input
                type="time"
                value={doseMorningTime}
                onChange={(e) => setDoseMorningTime(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">Večernja doza</span>
              <Input
                type="time"
                value={doseEveningTime}
                onChange={(e) => setDoseEveningTime(e.target.value)}
              />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5">
            {FOCUS_QUIZ_QUESTIONS.map((q, qi) => (
              <fieldset key={q.key} className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-ink">{q.prompt}</legend>
                <div className="flex gap-1.5">
                  {FOCUS_QUIZ_SCALE_LABELS.map((label, li) => {
                    const value = li + 1
                    const selected = quizAnswers[qi] === value
                    return (
                      <button
                        key={value}
                        type="button"
                        title={label}
                        aria-pressed={selected}
                        onClick={() =>
                          setQuizAnswers((prev) => {
                            const copy = [...prev]
                            copy[qi] = value
                            return copy
                          })
                        }
                        className={cn(
                          'flex h-9 flex-1 items-center justify-center rounded-full border text-sm font-medium transition-colors',
                          selected
                            ? 'border-transparent bg-lime text-ink'
                            : 'border-border bg-background text-slate-mid hover:bg-muted',
                        )}
                      >
                        {value}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}
            <p className="text-xs text-muted-foreground">1 = veoma loše · 5 = odlično</p>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">{packagesNum}</strong> pakovanja · doze{' '}
                <strong className="text-foreground">{doseMorningTime}</strong> i{' '}
                <strong className="text-foreground">{doseEveningTime}</strong>
              </p>
              <p>
                Zalihe ističu oko <strong className="text-foreground">{estimate.runoutLabel}</strong>
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={requestNotifications}
              disabled={notifAsked}
            >
              {notifAsked ? 'Podsetnici uključeni' : 'Uključi podsetnike'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Podsetnike možeš kasnije promeniti u Podešavanjima.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          {step > 1 && (
            <Button type="button" variant="ghost" size="lg" onClick={back} disabled={isPending}>
              Nazad
            </Button>
          )}
          {step < TOTAL_STEPS ? (
            <Button
              type="button"
              variant="lime"
              size="lg"
              className="flex-1"
              onClick={next}
              disabled={step === 3 && !quizComplete}
            >
              Dalje
            </Button>
          ) : (
            <Button
              type="button"
              variant="lime"
              size="lg"
              className="flex-1"
              onClick={submit}
              disabled={isPending}
            >
              {isPending ? 'Čuvam…' : 'Završi onboarding'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="mt-3 flex gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 flex-1 rounded-full transition-colors',
            i < current ? 'bg-lime' : 'bg-border',
          )}
        />
      ))}
    </div>
  )
}
