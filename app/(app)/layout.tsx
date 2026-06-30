import { redirect } from 'next/navigation'

import { AppHeader } from '@/components/app-shell/app-header'
import { BottomNav } from '@/components/app-shell/bottom-nav'
import { Sidebar } from '@/components/app-shell/sidebar'
import { refreshAccessStatusForProfile } from '@/lib/access/status'
import { getCurrentProfile, isAdmin } from '@/lib/auth'

/**
 * Zajednički shell za autentikovani deo aplikacije.
 * Defense-in-depth uz middleware: ako nema profila (nema sesije ili webhook
 * još nije kreirao red), šaljemo na sign-in.
 *
 * Responsive navigacija: bottom tab bar na mobilnom → levi sidebar na desktop-u.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  if (!profile) {
    redirect('/sign-in')
  }

  // Login put: osveži VIP/inactive status pri ulasku u app (hvata istek pre dnevnog cron-a).
  // Rola iz Clerk session claim-a je izvor istine — sinhronizuje DB ako webhook nije stigao.
  const authoritativeRole = (await isAdmin()) ? 'admin' : 'user'
  const status = await refreshAccessStatusForProfile(profile, authoritativeRole)

  // Korak 1.3 — gejt pristupa: samo važeći kupci (vip / subscriber / admin→vip) ulaze.
  // Korisnik bez porudžbine (`inactive`) ide na informativni ekran.
  if (status === 'inactive') {
    redirect('/nemas-pristup')
  }

  // Korak 1.4 — gejt onboardinga: dok ga ne završi, korisnik ide na setup protokola.
  // Ruta /onboarding je van (app) grupe pa nema petlje.
  if (!profile.onboardingCompleted) {
    redirect('/onboarding')
  }

  return (
    <div className="min-h-dvh bg-paper">
      <Sidebar />

      <div className="md:pl-64">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 pt-6 pb-28 md:pb-10">{children}</main>
      </div>

      <BottomNav />
    </div>
  )
}
