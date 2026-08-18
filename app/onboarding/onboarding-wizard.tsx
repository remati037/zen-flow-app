'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { belgradeToday } from '@/lib/dates'
import { CAPSULES_PER_PACKAGE, estimateDaysRemaining, estimateRunoutDate } from '@/lib/protocol/dosing'
import { FOCUS_QUIZ_LENGTH, scoreFocusQuiz } from '@/lib/quiz/focus-quiz'

import { completeOnboarding } from './actions'
import { CelebrationStep } from './steps/celebration-step'
import { DosesStep } from './steps/doses-step'
import { INTRO_SLIDE_COUNT, IntroSlides } from './steps/intro-slides'
import { STEP_TRANSITION, stepVariants } from './steps/motion'
import { NotificationsStep } from './steps/notifications-step'
import { OnboardingProgress } from './steps/onboarding-progress'
import { ProtocolStep } from './steps/protocol-step'
import { QuizStep } from './steps/quiz-step'
import { ResultStep } from './steps/result-step'
import type { SupplyEstimate } from './steps/types'

type Phase = 'intro' | 'protocol' | 'doses' | 'quiz' | 'result' | 'notifications' | 'done'

/** Faze koje ulaze u progress bar (intro i celebracija su van brojanja). */
type TrackedPhase = Exclude<Phase, 'intro' | 'done'>

/**
 * Opseg progress bara po fazi: [početak, kraj]. Unutar kviza se pozicija
 * interpolira po broju odgovorenih pitanja, pa traka raste i tokom kviza.
 */
const PHASE_RANGE: Record<TrackedPhase, [number, number]> = {
  protocol: [0.08, 0.22],
  doses: [0.22, 0.36],
  quiz: [0.36, 0.72],
  result: [0.72, 0.88],
  notifications: [0.88, 1],
}

const PHASE_LABEL: Record<TrackedPhase, string> = {
  protocol: 'Protokol',
  doses: 'Vreme doza',
  quiz: 'Focus Score kviz',
  result: 'Rezultat',
  notifications: 'Podsetnici',
}

function formatDateSr(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('sr-RS', { day: 'numeric', month: 'long', year: 'numeric' })
}

function isTracked(phase: Phase): phase is TrackedPhase {
  return phase !== 'intro' && phase !== 'done'
}

/**
 * Onboarding wizard (Korak 1.13).
 *
 * Tok: intro (3 slajda) → protokol → doze → kviz (pitanje po ekranu) →
 * rezultat → podsetnici → celebracija.
 *
 * Sav state je client-side; jedini upis je `completeOnboarding` na kraju
 * koraka 4 — bez parcijalne perzistencije, pa se nazad može bilo gde.
 */
export function OnboardingWizard({ defaultPackages }: { defaultPackages: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [phase, setPhase] = useState<Phase>('intro')
  const [introSlide, setIntroSlide] = useState(0)
  const [quizIndex, setQuizIndex] = useState(0)

  const [packages, setPackages] = useState(String(defaultPackages))
  const [startDate, setStartDate] = useState(belgradeToday())
  const [doseMorningTime, setDoseMorningTime] = useState('08:00')
  const [doseEveningTime, setDoseEveningTime] = useState('20:00')
  const [quizAnswers, setQuizAnswers] = useState<(number | null)[]>(
    Array(FOCUS_QUIZ_LENGTH).fill(null),
  )

  const [newBadges, setNewBadges] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const packagesNum = Math.max(1, Number.parseInt(packages, 10) || 1)
  const capsules = packagesNum * CAPSULES_PER_PACKAGE

  const estimate = useMemo<SupplyEstimate>(
    () => ({
      packages: packagesNum,
      capsules,
      days: estimateDaysRemaining(capsules),
      runoutLabel: formatDateSr(estimateRunoutDate(startDate, capsules)),
    }),
    [packagesNum, capsules, startDate],
  )

  // Skor se računa istom funkcijom kao na serveru — rezultat na ekranu i
  // `focusScoreBaseline` u bazi ne mogu da se raziđu.
  const score = useMemo(
    () => scoreFocusQuiz(quizAnswers.map((a) => a ?? 0)),
    [quizAnswers],
  )

  const progress = useMemo(() => {
    if (!isTracked(phase)) return phase === 'done' ? 1 : 0
    const [start, end] = PHASE_RANGE[phase]
    const inner = phase === 'quiz' ? Math.min(1, quizIndex / FOCUS_QUIZ_LENGTH) : 0
    return start + (end - start) * inner
  }, [phase, quizIndex])

  function goTo(next: Phase) {
    setError(null)
    setPhase(next)
  }

  function handleQuizSelect(questionIndex: number, value: number) {
    setQuizAnswers((prev) => {
      const copy = [...prev]
      copy[questionIndex] = value
      return copy
    })
  }

  function handleQuizNext() {
    if (quizIndex < FOCUS_QUIZ_LENGTH - 1) {
      setQuizIndex((i) => i + 1)
    } else {
      goTo('result')
    }
  }

  function handleQuizBack() {
    if (quizIndex > 0) {
      setQuizIndex((i) => i - 1)
    } else {
      goTo('doses')
    }
  }

  function submit() {
    setError(null)
    const answers = quizAnswers.filter((a): a is number => a !== null)
    if (answers.length !== FOCUS_QUIZ_LENGTH) {
      setQuizIndex(quizAnswers.findIndex((a) => a === null))
      goTo('quiz')
      return
    }

    startTransition(async () => {
      const result = await completeOnboarding({
        packages: packagesNum,
        startDate,
        doseMorningTime,
        doseEveningTime,
        quizAnswers: answers,
      })
      if (result.ok) {
        setNewBadges(result.data.newBadges)
        setPhase('done')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Card className="w-full max-w-md shadow-soft">
      {isTracked(phase) && (
        <CardHeader>
          <OnboardingProgress
            value={progress}
            label={`ZenFlow · ${PHASE_LABEL[phase]}`}
          />
        </CardHeader>
      )}

      <CardContent className="min-h-[26rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={phase}
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={STEP_TRANSITION}
          >
            {phase === 'intro' && (
              <IntroSlides
                index={introSlide}
                onIndexChange={setIntroSlide}
                onFinish={() => goTo('protocol')}
                onSkip={() => {
                  setIntroSlide(INTRO_SLIDE_COUNT - 1)
                  goTo('protocol')
                }}
              />
            )}

            {phase === 'protocol' && (
              <ProtocolStep
                packages={packages}
                startDate={startDate}
                estimate={estimate}
                onPackagesChange={setPackages}
                onStartDateChange={setStartDate}
                onNext={() => goTo('doses')}
                onBack={() => {
                  setIntroSlide(INTRO_SLIDE_COUNT - 1)
                  goTo('intro')
                }}
              />
            )}

            {phase === 'doses' && (
              <DosesStep
                doseMorningTime={doseMorningTime}
                doseEveningTime={doseEveningTime}
                onMorningChange={setDoseMorningTime}
                onEveningChange={setDoseEveningTime}
                onNext={() => goTo('quiz')}
                onBack={() => goTo('protocol')}
              />
            )}

            {phase === 'quiz' && (
              <QuizStep
                answers={quizAnswers}
                index={quizIndex}
                onSelect={handleQuizSelect}
                onNext={handleQuizNext}
                onBack={handleQuizBack}
              />
            )}

            {phase === 'result' && (
              <ResultStep
                score={score}
                answers={quizAnswers}
                onNext={() => goTo('notifications')}
                onBack={() => {
                  setQuizIndex(FOCUS_QUIZ_LENGTH - 1)
                  goTo('quiz')
                }}
              />
            )}

            {phase === 'notifications' && (
              <NotificationsStep
                estimate={estimate}
                doseMorningTime={doseMorningTime}
                doseEveningTime={doseEveningTime}
                isPending={isPending}
                error={error}
                onSubmit={submit}
                onBack={() => goTo('result')}
              />
            )}

            {phase === 'done' && (
              <CelebrationStep
                badgeKeys={newBadges}
                onGoToDashboard={() => router.push('/dashboard')}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
