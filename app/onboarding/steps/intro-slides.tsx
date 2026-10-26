'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Award, CalendarCheck, Flame, Package, Sparkles, Timer, TrendingUp, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { SLIDE_TRANSITION, slideVariants } from './motion'

interface IntroSlide {
  icon: LucideIcon
  eyebrow: string
  title: string
  body: string
  /** Opcioni bulleti — koristi ih poslednji slajd ("šta dobijaš"). */
  bullets?: { icon: LucideIcon; title: string; text: string }[]
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
    title: 'ZenFlow se uzima po protokolu',
    body: 'Protokol čine dve doze dnevno, uvek u isto vreme. Jutarnja te nosi kroz prepodne, a popodnevna, oko 14h, kroz ostatak dana. Upravo taj stalni ritam je ono što daje rezultat.',
  },
  {
    icon: TrendingUp,
    eyebrow: 'Uvod · 2 od 3',
    title: 'Efekat raste sa svakim danom',
    body: 'ZenFlow ne deluje kao kafa, odmah i kratko. Efekat se gradi postepeno: većina ljudi prvu jasnu razliku primeti posle 10 do 14 dana redovnog uzimanja. Ako napraviš pauzu od nekoliko dana, deo tog napretka se gubi. Zato aplikacija broji dane zaredom i javlja ti na vreme da dopuniš zalihe.',
  },
  {
    icon: Flame,
    eyebrow: 'Uvod · 3 od 3',
    title: 'Šta dobijaš u aplikaciji',
    body: 'Četiri alata koja ti pomažu da ostaneš u ritmu.',
    bullets: [
      {
        icon: CalendarCheck,
        title: 'Beleženje doza',
        text: 'Jednim dodirom potvrdi jutarnju i popodnevnu dozu i gledaj kako raste broj dana zaredom.',
      },
      {
        icon: Package,
        title: 'Praćenje zaliha',
        text: 'Aplikacija računa koliko ti je kapsula ostalo i javlja ti nekoliko dana pre nego što ponestane.',
      },
      {
        icon: Timer,
        title: 'Fokus tajmer i zadaci',
        text: 'Rad u blokovima od 25 ili 50 minuta, uz do tri najvažnija zadatka za taj dan.',
      },
      {
        icon: Award,
        title: 'Bedževi i napredak',
        text: 'Nagrade za prve korake i nizove dana, uz Focus Score koji pokazuje kako napreduješ.',
      },
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
            <p className="text-xs font-medium tracking-wide text-slate-soft uppercase">
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
                    key={bullet.title}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...SLIDE_TRANSITION, delay: 0.06 * (i + 1) }}
                    className="flex items-start gap-2.5 rounded-lg bg-paper px-3 py-2.5 text-sm"
                  >
                    <BulletIcon className="mt-0.5 size-4 shrink-0 text-slate-soft" />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium text-ink">{bullet.title}</span>
                      <span className="leading-snug text-slate-mid">{bullet.text}</span>
                    </span>
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
            className="inline-flex min-h-11 items-center self-center rounded-lg px-3 text-sm font-medium text-slate-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Preskoči uvod
          </button>
        )}
      </div>
    </div>
  )
}
