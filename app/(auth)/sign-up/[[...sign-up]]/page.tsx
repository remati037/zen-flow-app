import { SignUp } from '@clerk/nextjs'
import { redirect } from 'next/navigation'

import { SignUpRequestForm } from '@/components/auth/sign-up-request-form'

/**
 * Registracija je SAMO preko pozivnice (Clerk Restricted sign-up mod).
 *
 *  - Sa `__clerk_ticket` u URL-u (link iz mejla) → Clerk `<SignUp />`, koji tiket
 *    sam prepozna; mejl je njime već verifikovan.
 *  - Podrute (`/sign-up/continue`, `/sign-up/verify-…`) su koraci Clerk-ovog
 *    toka koji je već počeo sa tiketom, pa i one idu na `<SignUp />`.
 *  - Bez tiketa → forma u kojoj kupac traži link. Ne-kupac dobija isti odgovor,
 *    ali mu link nikad ne stigne.
 *
 * Ovo NIJE brava, samo UX: i da neko otvori `<SignUp />` bez tiketa, Clerk u
 * Restricted modu odbija registraciju sam. Brava je podešavanje u Dashboard-u.
 */
export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ 'sign-up'?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ 'sign-up': segments }, query] = await Promise.all([params, searchParams])

  // Clerk ovako javlja da pozvani mejl već ima nalog — tiket tada služi za prijavu.
  if (query.__clerk_status === 'sign_in') {
    redirect('/sign-in')
  }

  if (query.__clerk_ticket || (segments && segments.length > 0)) {
    return <SignUp />
  }

  return <SignUpRequestForm />
}
