import 'server-only'

import { redirect } from 'next/navigation'
import { cache } from 'react'

import { refreshAccessStatusForProfile, type AccessStatus } from '@/lib/access/status'
import { getCurrentProfile, isAdmin, type Profile } from '@/lib/auth'

export type AppAccess = {
  profile: Profile
  admin: boolean
  /** Efektivni status posle osvežavanja — nikad `inactive` (taj ide na redirect). */
  status: AccessStatus
}

/**
 * Gejt za ČITANJE u autentikovanom delu aplikacije — zove ga `(app)/layout.tsx`
 * I SVAKA `(app)` stranica.
 *
 * Zašto i stranica, a ne samo layout: App Router pri klijentskoj navigaciji (RSC
 * zahtev sa `Next-Router-State-Tree` header-om) renderuje samo segmente koji se
 * menjaju. Namešten header traži render samo stranice — layout se tada uopšte ne
 * izvršava, pa redirect u njemu ne štiti ništa i `inactive` korisnik čita
 * dashboard, protokol i zalihe. Upisi su već gejtovani u `createAction`
 * (`requireActiveAccess`); ovo je isti gejt za čitanje.
 *
 * `cache()` deduplikuje poziv u okviru jednog zahteva: layout + stranica u istom
 * renderu dele jedan profil i jedan refresh, pa provera po stranici ne dodaje
 * nijedan DB poziv.
 */
export const requireAppAccess = cache(async (): Promise<AppAccess> => {
  const profile = await getCurrentProfile()
  if (!profile) {
    redirect('/sign-in')
  }

  // Rola iz Clerk session claim-a je izvor istine — sinhronizuje DB ako webhook nije stigao.
  const admin = await isAdmin()
  const status = await refreshAccessStatusForProfile(profile, admin ? 'admin' : 'user')

  // Korak 1.3 — samo važeći kupci (vip / subscriber / admin→vip) ulaze.
  if (status === 'inactive') {
    redirect('/nemas-pristup')
  }

  // Korak 1.4 — dok ne završi onboarding, korisnik ide na setup protokola.
  // Ruta /onboarding je van (app) grupe pa nema petlje.
  if (!profile.onboardingCompleted) {
    redirect('/onboarding')
  }

  return { profile: { ...profile, accessStatus: status }, admin, status }
})
