'use client'

import { useEffect } from 'react'

import { syncPushSubscription } from '@/lib/push/client'

/**
 * Tihi re-upsert push pretplate pri ulasku u aplikaciju.
 *
 * Renderuje se u `(app)/layout.tsx`, koji u App Router-u preživljava navigaciju —
 * pa se efekat izvrši jednom po učitavanju app-a, ne po promeni rute.
 *
 * Zašto uopšte postoji: rotaciju endpoint-a hvata `pushsubscriptionchange` u
 * service worker-u, ali taj događaj nije garantovan — browser ume da ga propusti,
 * SW može biti ubijen pre nego što stigne da javi, a neki browseri ga isporuče
 * bez `oldSubscription`, pa server ne zna koju pretplatu da premesti. Bez ovog
 * drugog sloja otkaz je TIH: browser i dalje ima pretplatu, baza je nema, i
 * podsetnici prosto prestanu bez ijedne poruke.
 *
 * Ne renderuje ništa i ne javlja ništa korisniku: ovo je održavanje, ne akcija.
 * `syncPushSubscription` nikad ne traži dozvolu i ne pravi pretplatu iz ničega.
 */
export function PushSync() {
  useEffect(() => {
    void syncPushSubscription()
  }, [])

  return null
}
