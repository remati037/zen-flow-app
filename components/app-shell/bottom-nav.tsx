'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'

/**
 * Donja tab traka — mobilni (md:hidden). Fixed dno, safe-area padding za
 * PWA standalone režim. Aktivni tab: ink boja i tanka linija iznad.
 */
export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-white/90 backdrop-blur-md md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
                  active ? 'text-ink' : 'text-slate-soft hover:text-slate-mid',
                )}
              >
                {/* Aktivni tab: tanka lime linija iznad, umesto „pilule" oko ikonice. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-0 h-0.5 w-6 rounded-full transition-colors',
                    active ? 'bg-ink' : 'bg-transparent',
                  )}
                />
                <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.6} />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
