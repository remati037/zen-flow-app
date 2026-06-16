import { UserButton } from '@clerk/nextjs'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AdminNav } from '@/components/app-shell/admin-nav'
import { isAdmin } from '@/lib/auth'

/**
 * Admin shell — odvojen od korisničkog. Gejtuje ceo /admin/* segment serverski
 * (defense-in-depth uz middleware role check).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-dvh bg-paper">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-ink/10 bg-white px-4 py-6 md:flex">
        <div className="px-3 pb-6">
          <p className="text-xs tracking-wide text-slate-soft uppercase">NuroLab</p>
          <p className="text-lg font-medium text-ink">Admin</p>
        </div>

        <AdminNav />

        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-mid transition-colors hover:bg-paper hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Nazad na app
        </Link>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink/10 bg-paper/80 px-4 backdrop-blur-md">
          <Link href="/admin" className="text-base font-medium text-ink md:hidden">
            Admin
          </Link>
          <div className="hidden md:block" />
          <UserButton />
        </header>
        <div className="border-b border-ink/10 bg-paper/80 px-4 py-2 md:hidden">
          <AdminNav variant="mobile" />
        </div>
        <main className="mx-auto max-w-4xl px-4 pt-6 pb-10">{children}</main>
      </div>
    </div>
  )
}
