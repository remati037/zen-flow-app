'use client'

import { useEffect } from 'react'
import { motion } from 'motion/react'
import { PartyPopper, Sprout } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getBadge, sortBadgeKeys } from '@/lib/badges/catalog'
import { fireConfetti } from '@/lib/confetti'

/**
 * Finiš — confetti + reveal osvojenih bedževa (`protokol-zapocet` iz 1.11).
 *
 * Namerno bez `router.refresh()`: onboarding je već završen na serveru, pa bi
 * refresh odmah redirect-ovao stranicu i pojeo celebraciju. Na dashboard se ide
 * tek klikom na CTA.
 */
export function CelebrationStep({
  badgeKeys,
  onGoToDashboard,
}: {
  badgeKeys: readonly string[]
  onGoToDashboard: () => void
}) {
  const badges = sortBadgeKeys(badgeKeys)
    .map((key) => getBadge(key))
    .filter((badge) => badge !== undefined)

  useEffect(() => {
    void fireConfetti()
  }, [])

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="flex size-16 items-center justify-center rounded-full bg-lime text-ink"
      >
        <PartyPopper className="size-8" />
      </motion.span>

      <div className="flex flex-col gap-1.5">
        <h2 className="font-heading text-xl leading-tight font-medium text-ink">
          Protokol je aktivan
        </h2>
        <p className="text-sm leading-relaxed text-slate-mid">
          Sve je podešeno. Od danas se broji niz — prvi check-in te čeka na početnoj.
        </p>
      </div>

      {badges.length > 0 ? (
        <div className="flex w-full flex-col gap-2">
          {badges.map((badge, i) => {
            const Icon = badge.icon
            return (
              <motion.div
                key={badge.key}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 240, damping: 20, delay: 0.25 + i * 0.12 }}
                className="flex items-center gap-3 rounded-xl bg-white p-4 text-left shadow-soft ring-1 ring-lime"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-lime text-ink">
                  <Icon className="size-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium tracking-wide text-slate-soft uppercase">
                    Novi bedž
                  </p>
                  <p className="font-heading text-base font-medium text-ink">{badge.title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-slate-mid">{badge.description}</p>
                </div>
              </motion.div>
            )
          })}
        </div>
      ) : (
        <div className="flex w-full items-center gap-3 rounded-xl bg-paper p-4 text-left">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-ink">
            <Sprout className="size-6" />
          </span>
          <p className="text-sm leading-snug text-slate-mid">
            Protokol je sačuvan. Bedževe pratiš na stranici Bedževi.
          </p>
        </div>
      )}

      <Button type="button" variant="lime" size="lg" className="w-full" onClick={onGoToDashboard}>
        Kreni na Dashboard
      </Button>
    </div>
  )
}
