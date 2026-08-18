'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  FOCUS_QUIZ_LENGTH,
  FOCUS_QUIZ_QUESTIONS,
  FOCUS_QUIZ_SCALE_LABELS,
} from '@/lib/quiz/focus-quiz'

import { SLIDE_TRANSITION, slideVariants } from './motion'
import { StepHeading } from './step-heading'

/** Pauza posle izbora — taman da se vidi selekcija, a da flow ostane brz. */
const AUTO_ADVANCE_MS = 350

/**
 * Korak 3 — Focus Score kviz, jedno pitanje po ekranu.
 *
 * Indeks pitanja drži wizard (da "Nazad" sa rezultata vrati na poslednje
 * pitanje), a smer horizontalnog slajda je lokalan jer ga okidaju dugmad ovde.
 * Posle izbora se ekran zaključava na `AUTO_ADVANCE_MS` i sam prelazi dalje.
 */
export function QuizStep({
  answers,
  index,
  onSelect,
  onNext,
  onBack,
}: {
  answers: (number | null)[]
  index: number
  onSelect: (questionIndex: number, value: number) => void
  onNext: () => void
  onBack: () => void
}) {
  const question = FOCUS_QUIZ_QUESTIONS[index] ?? FOCUS_QUIZ_QUESTIONS[0]
  const current = answers[index]

  const [direction, setDirection] = useState(1)
  // Zaključava dugmad dok traje auto-advance, da dupli tap ne preskoči pitanje.
  const [locked, setLocked] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // Otkaži zakazani prelaz ako korak nestane pre isteka pauze.
  useEffect(() => clearTimer, [])

  function choose(value: number) {
    if (locked) return
    onSelect(index, value)
    setDirection(1)
    setLocked(true)
    clearTimer()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setLocked(false)
      onNext()
    }, AUTO_ADVANCE_MS)
  }

  function goBack() {
    clearTimer()
    setLocked(false)
    setDirection(-1)
    onBack()
  }

  return (
    <div className="flex flex-col gap-5">
      <StepHeading
        eyebrow={`Korak 3 od 5 · Pitanje ${index + 1}/${FOCUS_QUIZ_LENGTH}`}
        title="Focus Score — početno stanje"
        description="Kratak snimak startne pozicije. Nije medicinska procena."
      />

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.fieldset
          key={question.key}
          custom={direction}
          variants={slideVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={SLIDE_TRANSITION}
          className="flex min-h-52 flex-col gap-4"
        >
          <legend className="flex flex-col gap-1">
            <span className="font-heading text-base leading-snug font-medium text-ink">
              {question.prompt}
            </span>
            <span className="text-xs text-slate-soft">{question.hint}</span>
          </legend>

          <div className="flex items-stretch gap-1.5">
            {question.emojis.map((emoji, i) => {
              const value = i + 1
              const selected = current === value
              const label = FOCUS_QUIZ_SCALE_LABELS[i]
              return (
                <motion.button
                  key={value}
                  type="button"
                  title={label}
                  aria-label={`${value} — ${label}`}
                  aria-pressed={selected}
                  onClick={() => choose(value)}
                  whileTap={{ scale: 0.92 }}
                  animate={{ scale: selected ? 1.06 : 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-1 rounded-xl border px-1 py-3 transition-colors',
                    selected
                      ? 'border-transparent bg-lime text-ink shadow-soft'
                      : 'border-border bg-white text-slate-mid hover:bg-paper',
                  )}
                >
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {emoji}
                  </span>
                  <span className="text-[10px] leading-tight font-medium">{label}</span>
                </motion.button>
              )
            })}
          </div>

          <p className="text-xs text-slate-soft">
            Dodirni odgovor — sledeće pitanje stiže samo.
          </p>
        </motion.fieldset>
      </AnimatePresence>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={goBack}>
          Nazad
        </Button>
        <Button
          type="button"
          variant="lime"
          size="lg"
          className="flex-1"
          disabled={current == null || locked}
          onClick={() => {
            clearTimer()
            setDirection(1)
            onNext()
          }}
        >
          {index === FOCUS_QUIZ_LENGTH - 1 ? 'Vidi rezultat' : 'Dalje'}
        </Button>
      </div>
    </div>
  )
}
