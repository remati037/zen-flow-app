import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { isAdmin } from '@/lib/auth'

export default async function AdminPage() {
  // Defense-in-depth: middleware već gejtuje /admin, ali proveravamo i serverski.
  if (!(await isAdmin())) {
    redirect('/dashboard')
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-soft">NuroLab</p>
            <h1 className="text-2xl font-medium text-ink">Admin panel</h1>
          </div>
          <UserButton />
        </header>

        <section className="rounded-[28px] bg-white p-6 shadow-soft">
          <p className="text-sm text-slate-mid">
            Placeholder za admin funkcionalnosti (lista korisnika, porudžbine,
            metrike, slanje mejlova) — dolaze u narednim koracima Faze 1.
          </p>
        </section>

        <Link href="/dashboard" className="text-sm text-slate-soft hover:text-ink">
          ← Nazad na dashboard
        </Link>
      </div>
    </main>
  )
}
