'use client'

import { Settings, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'

/**
 * Levi sidebar — desktop (hidden md:flex). Ista NAV_ITEMS lista kao bottom-nav
 * + Podešavanja na dnu, i link na admin panel kad je korisnik admin.
 */
export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-ink/10 bg-white px-4 py-6 md:flex">
      <Link href="/dashboard" className="px-3 pb-6 text-lg font-medium text-ink">
        ZenFlow<span className="text-slate-soft">™</span>
      </Link>

      <nav className="flex-1">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
                    active ? 'bg-lime text-ink' : 'text-slate-mid hover:bg-paper hover:text-ink',
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="space-y-1">
        {isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-ink ring-1 ring-ink/10 transition-colors hover:bg-lime-soft"
          >
            <ShieldCheck aria-hidden className="h-5 w-5" />
            Admin panel
          </Link>
        )}

        <Link
          href="/podesavanja"
          aria-current={isActive('/podesavanja') ? 'page' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
            isActive('/podesavanja')
              ? 'bg-lime text-ink'
              : 'text-slate-mid hover:bg-paper hover:text-ink',
          )}
        >
          <Settings className="h-5 w-5" />
          Podešavanja
        </Link>
      </div>
    </aside>
  )
}
