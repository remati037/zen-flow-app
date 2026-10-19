import { Settings, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

/**
 * Gornji header app shell-a. Logo je vidljiv samo na mobilnom (na desktop-u
 * stoji u sidebar-u). Desno: prečica na admin panel (samo za admine) i
 * Podešavanja.
 *
 * Admin prečica stoji baš ovde jer je header vidljiv na SVIM veličinama —
 * bottom-nav je namerno ograničen na 5 stavki, pa admin ne staje tamo.
 *
 * Clerk `UserButton` je uklonjen (Sprint 5): meni je bio na engleskom, cilj
 * mali, a odjava i nalog već postoje u Podešavanja › Nalog.
 *
 * `safe-area-inset-top`: viewport je `viewport-fit=cover`, pa instaliran PWA
 * na iPhone-u crta i ispod notch-a/Dynamic Island-a — bez ovog paddinga header
 * se podvlači pod statusnu traku.
 */
export function AppHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-ink/10 bg-paper/80 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex h-14 items-center justify-between px-4">
        <Link
          href="/dashboard"
          className="flex min-h-11 items-center text-base font-medium text-ink md:hidden"
        >
          ZenFlow<span className="text-slate-soft">™</span>
        </Link>
        <div className="hidden md:block" />

        <div className="flex items-center gap-1">
          {isAdmin && (
            <Link
              href="/admin"
              aria-label="Admin panel"
              title="Admin panel"
              className="flex h-11 items-center gap-1.5 rounded-full bg-lime px-3 text-sm font-medium text-ink transition-colors hover:bg-lime-deep"
            >
              <ShieldCheck aria-hidden className="h-4 w-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}

          <Link
            href="/podesavanja"
            aria-label="Podešavanja"
            className="flex size-11 items-center justify-center rounded-full text-slate-mid transition-colors hover:bg-white hover:text-ink"
          >
            <Settings aria-hidden className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  )
}
