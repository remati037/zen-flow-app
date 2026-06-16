'use client'

import { Package, ShoppingBag, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const ADMIN_NAV_ITEMS = [
  { href: '/admin', label: 'Pregled', icon: Package, exact: true },
  { href: '/admin/korisnici', label: 'Korisnici', icon: Users, exact: false },
  { href: '/admin/porudzbine', label: 'Porudžbine', icon: ShoppingBag, exact: false },
] as const

/**
 * Admin navigacija. `variant="sidebar"` = vertikalna (desktop),
 * `variant="mobile"` = horizontalna scroll traka (mobilni).
 */
export function AdminNav({ variant = 'sidebar' }: { variant?: 'sidebar' | 'mobile' }) {
  const pathname = usePathname()

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav className={cn('flex-1', variant === 'mobile' && 'flex-none')}>
      <ul
        className={cn(
          variant === 'sidebar'
            ? 'space-y-1'
            : 'flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]',
        )}
      >
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.exact)
          const Icon = item.icon
          return (
            <li key={item.href} className={variant === 'mobile' ? 'shrink-0' : undefined}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                  active ? 'bg-lime text-ink' : 'text-slate-mid hover:bg-paper hover:text-ink',
                )}
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
