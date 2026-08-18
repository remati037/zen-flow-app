'use client'

import { useSyncExternalStore } from 'react'
import { Share, SquarePlus } from 'lucide-react'

import { isPushSupported } from '@/lib/push/client'

/** Stanje se ne menja tokom života stranice — nema na šta da se pretplatimo. */
const noopSubscribe = () => () => {}

/**
 * Da li treba prikazati uputstvo: iOS Safari, van instaliranog PWA, bez push podrške.
 * Deterministički (isti rezultat pri svakom pozivu), pa je bezbedan kao snapshot.
 */
function shouldShowHint(): boolean {
  // Već instaliran PWA → push radi, banner nema svrhu.
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return false

  // iPadOS 13+ se predstavlja kao Mac, pa se prepoznaje po touch tačkama.
  const ua = window.navigator.userAgent
  const isIos =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1)

  return isIos && !isPushSupported()
}

/**
 * Banner sa uputstvom za "Dodaj na početni ekran".
 *
 * Zašto postoji: iOS dozvoljava Web Push ISKLJUČIVO instaliranom PWA-u. U Safariju
 * van instalirane aplikacije `Notification` uopšte ne postoji, pa `PushToggle`
 * nema šta da ponudi — korisnik bi ostao bez podsetnika i bez objašnjenja zašto.
 *
 * Sam se sakriva kad nije relevantan: kad push radi (Android/desktop, ili već
 * instaliran iOS PWA) vraća `null`.
 */
export function IosInstallHint() {
  // `useSyncExternalStore` umesto effect+setState: server snapshot je uvek `false`,
  // pa hidracija prolazi čisto, a detekcija se radi u renderu na klijentu.
  const show = useSyncExternalStore(noopSubscribe, shouldShowHint, () => false)

  if (!show) return null

  return (
    <div className="rounded-xl bg-lime-soft p-4 ring-1 ring-foreground/10">
      <p className="font-heading text-sm font-medium text-ink">
        Dodaj ZenFlow na početni ekran
      </p>
      <p className="mt-1 text-sm leading-snug text-slate-mid">
        Na iPhone-u i iPad-u podsetnici rade samo iz instalirane aplikacije. Traje 10 sekundi:
      </p>

      <ol className="mt-3 flex flex-col gap-2 text-sm text-slate-mid">
        <li className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-ink ring-1 ring-foreground/10">
            <Share aria-hidden className="size-3.5" />
          </span>
          <span>
            Dodirni <strong className="font-medium text-ink">Share</strong> u donjoj traci Safarija.
          </span>
        </li>
        <li className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-ink ring-1 ring-foreground/10">
            <SquarePlus aria-hidden className="size-3.5" />
          </span>
          <span>
            Izaberi <strong className="font-medium text-ink">Add to Home Screen</strong>.
          </span>
        </li>
        <li className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime font-medium text-ink">
            3
          </span>
          <span>Otvori ZenFlow sa početnog ekrana i uključi podsetnike.</span>
        </li>
      </ol>
    </div>
  )
}
