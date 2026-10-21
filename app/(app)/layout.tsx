import { AppHeader } from '@/components/app-shell/app-header'
import { DayRolloverRefresh } from '@/components/app-shell/day-rollover-refresh'
import { BottomNav } from '@/components/app-shell/bottom-nav'
import { Sidebar } from '@/components/app-shell/sidebar'
import { PushSync } from '@/components/push/push-sync'
import { requireAppAccess } from '@/lib/access/app-gate'
import { belgradeToday } from '@/lib/dates'

/**
 * Zajednički shell za autentikovani deo aplikacije.
 * Defense-in-depth uz middleware: bez profila → sign-in, `inactive` → /nemas-pristup,
 * nezavršen onboarding → /onboarding (sve u `requireAppAccess`).
 *
 * Responsive navigacija: bottom tab bar na mobilnom → levi sidebar na desktop-u.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Gejt pristupa + onboardinga. Isti poziv stoji i u svakoj stranici (vidi
  // `lib/access/app-gate.ts` — layout se pri RSC navigaciji ne izvršava uvek).
  const { admin } = await requireAppAccess()

  return (
    <div className="min-h-dvh bg-paper">
      {/* Održavanje push pretplate — bez UI-a. Vidi `components/push/push-sync.tsx`. */}
      <PushSync />
      {/* Otvoren PWA preko ponoći → osveži render, da check-in ne gađa juče. */}
      <DayRolloverRefresh today={belgradeToday()} />
      <Sidebar isAdmin={admin} />

      <div className="md:pl-64">
        <AppHeader isAdmin={admin} />
        <main className="mx-auto max-w-3xl px-4 pt-6 pb-28 md:pb-10">{children}</main>
      </div>

      <BottomNav />
    </div>
  )
}
