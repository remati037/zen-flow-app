import { UserButton } from '@clerk/nextjs'
import { Settings } from 'lucide-react'
import Link from 'next/link'

/**
 * Gornji header app shell-a. Logo je vidljiv samo na mobilnom (na desktop-u
 * stoji u sidebar-u). Desno: link na Podešavanja + Clerk UserButton.
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink/10 bg-paper/80 px-4 backdrop-blur-md">
      <Link href="/dashboard" className="text-base font-medium text-ink md:hidden">
        ZenFlow<span className="text-slate-soft">™</span>
      </Link>
      <div className="hidden md:block" />

      <div className="flex items-center gap-1">
        <Link
          href="/podesavanja"
          aria-label="Podešavanja"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-mid transition-colors hover:bg-white hover:text-ink"
        >
          <Settings className="h-5 w-5" />
        </Link>
        <UserButton />
      </div>
    </header>
  )
}
