import { currentUser } from '@clerk/nextjs/server'
import Link from 'next/link'

import { getCurrentProfile, isAdmin } from '@/lib/auth'

export default async function DashboardPage() {
  const user = await currentUser()
  const profile = await getCurrentProfile()
  const admin = await isAdmin()

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-slate-soft">Dobrodošao nazad</p>
        <h1 className="text-2xl font-medium text-ink">
          {profile?.name || user?.firstName || 'Korisniče'}
        </h1>
      </header>

      <section className="rounded-[28px] bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-lg font-medium text-ink">Tvoj nalog</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-mid">Email</dt>
            <dd className="text-ink">{profile?.email ?? user?.emailAddresses[0]?.emailAddress}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-mid">Rola</dt>
            <dd className="text-ink">{profile?.role ?? 'user'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-mid">Status pristupa</dt>
            <dd className="text-ink">{profile?.accessStatus ?? 'inactive'}</dd>
          </div>
        </dl>
      </section>

      {admin && (
        <Link
          href="/admin"
          className="inline-block rounded-full bg-lime px-5 py-2.5 text-sm font-medium text-ink shadow-soft transition hover:bg-lime-deep"
        >
          Admin panel →
        </Link>
      )}
    </div>
  )
}
