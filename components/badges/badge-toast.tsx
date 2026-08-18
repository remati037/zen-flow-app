'use client'

import { X } from 'lucide-react'
import { toast } from 'sonner'

import { type BadgeDefinition, getBadge, sortBadgeKeys } from '@/lib/badges/catalog'
import { fireConfetti } from '@/lib/confetti'

/** Razmak između uzastopnih toast-ova kad se odjednom otključa više bedževa. */
const STAGGER_MS = 500
const TOAST_DURATION_MS = 7000

function BadgeToast({ badge, onDismiss }: { badge: BadgeDefinition; onDismiss: () => void }) {
  const Icon = badge.icon
  return (
    <div className="flex w-full items-start gap-3 rounded-xl bg-white p-4 shadow-lift ring-1 ring-lime">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-lime text-ink">
        <Icon className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium tracking-wide text-slate-soft uppercase">
          Novi bedž
        </p>
        <p className="font-heading text-base font-medium text-ink">{badge.title}</p>
        <p className="mt-0.5 text-xs leading-snug text-slate-mid">{badge.description}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Zatvori"
        className="-mt-1 -mr-1 rounded-full p-1 text-slate-soft transition-colors hover:bg-paper hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

/**
 * Celebracija novo-osvojenih bedževa: jedan confetti burst + toast po bedžu.
 * Zajednički helper za protokol (`logDose`) i fokus (`saveFocusSession`) — obe
 * akcije vraćaju `newBadges`, pa se samo prosledi rezultat.
 *
 * No-op kad je niz prazan (uobičajen slučaj), pa se može zvati bezuslovno.
 */
export function celebrateNewBadges(keys: readonly string[] | undefined): void {
  const badgeKeys = sortBadgeKeys(keys ?? [])
  if (badgeKeys.length === 0) return

  void fireConfetti()

  badgeKeys.forEach((key, i) => {
    const badge = getBadge(key)
    if (!badge) return
    setTimeout(() => {
      toast.custom(
        (id) => <BadgeToast badge={badge} onDismiss={() => toast.dismiss(id)} />,
        { duration: TOAST_DURATION_MS },
      )
    }, i * STAGGER_MS)
  })
}
