'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

import { belgradeToday } from '@/lib/dates'

/** Koliko često proveravamo prelazak dana dok je app vidljiv. */
const CHECK_INTERVAL_MS = 60_000

/**
 * Osveži server render kad beogradski dan pređe dok je app otvoren.
 *
 * Instalirani PWA ume da stoji otvoren (ili zamrznut u pozadini) danima. Bez
 * ovoga ekran posle ponoći i dalje prikazuje juče: check-in kartice nose
 * jučerašnji `today`, a 7-dnevni strip se ne pomera. Provera ide na povratak
 * u fokus (najčešći slučaj — telefon izvađen ujutru) i na minut dok je vidljiv.
 *
 * Refresh se okida najviše JEDNOM po klijentskom danu: ako klijentski sat
 * odstupa od serverskog, server bi vratio isti `today` i bez ovog čuvara bismo
 * osvežavali u petlji.
 */
export function DayRolloverRefresh({ today }: { today: string }) {
  const router = useRouter()
  const refreshedFor = useRef<string | null>(null)

  useEffect(() => {
    function check() {
      if (document.visibilityState !== 'visible') return
      const clientToday = belgradeToday()
      if (clientToday === today || refreshedFor.current === clientToday) return
      refreshedFor.current = clientToday
      router.refresh()
    }

    check()
    const interval = window.setInterval(check, CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [today, router])

  return null
}
