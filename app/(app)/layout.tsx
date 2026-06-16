import { redirect } from 'next/navigation'

import { AppHeader } from '@/components/app-shell/app-header'
import { BottomNav } from '@/components/app-shell/bottom-nav'
import { Sidebar } from '@/components/app-shell/sidebar'
import { getCurrentProfile } from '@/lib/auth'

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
