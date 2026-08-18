'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarCheck, Flame, Sparkles, Timer, TrendingDown, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { SLIDE_TRANSITION, slideVariants } from './motion'

interface IntroSlide {
  icon: LucideIcon
  eyebrow: string
  title: string
  body: string
  /** Opcioni bulleti — koristi ih poslednji slajd ("šta te čeka"). */
  bullets?: { icon: LucideIcon; text: string }[]
}

/**
 * Story intro pre setup-a. Slajd 2 nosi core brand insight (efekat se gradi
 * doslednošću, bledi prekidom) — to je razlog zašto app broji niz i zašto
 * postoje supply alerti; sve ostalo u aplikaciji visi o toj rečenici.
 */
const SLIDES: readonly IntroSlide[] = [
  {
    icon: Sparkles,
    eyebrow: 'Uvod · 1 od 3',
    title: 'ZenFlow nije tableta — to je protokol',
    body: 'Dve doze dnevno, u istim terminima. Jutarnja nosi fokus kroz radni deo dana, večernja radi na oporavku i bistrini sutradan. Ceo protokol staje u te dve tačke.',
  },
  {
    icon: TrendingDown,
    eyebrow: 'Uvod · 2 od 3',
    title: 'Efekat se gradi doslednošću — i bledi kad prekineš',
    body: 'Sastojci se akumuliraju. Prvi jasan pomak se obično oseti oko 10.–14. dana, a nekoliko propuštenih dana te vraća unazad. Zato ova aplikacija broji niz, a ne pojedinačne dane — i zato te opomene za zalihe stižu pre nego što ostaneš bez.',
  },
  {
    icon: Flame,
    eyebrow: 'Uvod · 3 od 3',
    title: 'Šta te čeka unutra',
    body: 'Sve je podređeno jednoj stvari: da niz ne pukne.',
    bullets: [
      { icon: CalendarCheck, text: 'Dnevni check-in obe doze i niz koji raste' },
      { icon: Flame, text: 'Praćenje zaliha i podsetnik pre nego što ponestane' },
      { icon: Timer, text: 'Pomodoro fokus blokovi i tri dnevna zadatka' },
      { icon: Sparkles, text: 'Bedževi za prekretnice u protokolu' },
    ],
  },
] as const

export const INTRO_SLIDE_COUNT = SLIDES.length

/**
 * Kontrolisana komponenta — indeks slajda drži wizard, da bi "Nazad" iz
 * koraka 1 vratio korisnika tačno na poslednji slajd uvoda.
 */
export function IntroSlides({
  index,
  onIndexChange,
  onFinish,
  onSkip,
}: {
  index: number
  onIndexChange: (next: number) => void
  onFinish: () => void
  onSkip: () => void
}) {
  const slide = SLIDES[index] ?? SLIDES[0]
  const Icon = slide.icon
  const isLast = index === SLIDES.length - 1

  // Smer horizontalnog slajda: 1 = napred, -1 = nazad (postavlja se pre promene indeksa).
  const [direction, setDirection] = useState(1)

  function go(next: number) {
    setDirection(next >= index ? 1 : -1)
    onIndexChange(next)
  }

  return (
    <div className="flex flex-col gap-6">
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={index}
          custom={direction}
          variants={slideVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={SLIDE_TRANSITION}
          className="flex min-h-64 flex-col gap-4"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-lime text-ink">
            <Icon className="size-7" />
          </span>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium tracking-wide text-slate-soft uppercase">
              {slide.eyebrow}
            </p>
            <h2 className="font-heading text-xl leading-tight font-medium text-ink">{slide.title}</h2>
            <p className="text-sm leading-relaxed text-slate-mid">{slide.body}</p>
          </div>

          {slide.bullets && (
            <ul className="flex flex-col gap-2">
              {slide.bullets.map((bullet, i) => {
                const BulletIcon = bullet.icon
                return (
                  <motion.li
                    key={bullet.text}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...SLIDE_TRANSITION, delay: 0.06 * (i + 1) }}
                    className="flex items-center gap-2.5 rounded-lg bg-paper px-3 py-2 text-sm text-ink"
                  >
                    <BulletIcon className="size-4 shrink-0 text-slate-soft" />
                    <span>{bullet.text}</span>
                  </motion.li>
                )
              })}
            </ul>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-1.5" aria-hidden="true">
        {SLIDES.map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i <= index ? 'bg-lime' : 'bg-paper',
            )}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {index > 0 && (
            <Button type="button" variant="ghost" size="lg" onClick={() => go(index - 1)}>
              Nazad
            </Button>
          )}
          <Button
            type="button"
            variant="lime"
            size="lg"
            className="flex-1"
            onClick={() => (isLast ? onFinish() : go(index + 1))}
          >
            {isLast ? 'Postavi protokol' : 'Dalje'}
          </Button>
        </div>
        {!isLast && (
          <button
            type="button"
            onClick={onSkip}
            className="self-center rounded-lg px-2 py-1 text-xs font-medium text-slate-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Preskoči uvod
          </button>
        )}
      </div>
    </div>
  )
}
