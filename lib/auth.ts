import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'

import { db, profiles } from '@/lib/db'

export type Profile = typeof profiles.$inferSelect

/**
 * Učita `profiles` red za trenutno ulogovanog korisnika.
 * Vraća `null` ako nema sesije ili red još ne postoji (npr. webhook kasni).
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const { userId } = await auth()
  if (!userId) return null

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)

  return profile ?? null
}

/**
 * Da li je trenutni korisnik admin (iz Clerk session claim-a).
 * Isti izvor istine kao middleware — bez DB poziva.
 */
export async function isAdmin(): Promise<boolean> {
  const { sessionClaims } = await auth()
  return sessionClaims?.metadata?.role === 'admin'
}

/**
 * Server-side guard za server actions / API rute.
 * Baca grešku ako korisnik nije admin — pozivalac vraća 403 / redirect.
 */
export async function requireAdmin(): Promise<void> {
  const { userId, sessionClaims } = await auth()
  if (!userId) {
    throw new Error('UNAUTHENTICATED')
  }
  if (sessionClaims?.metadata?.role !== 'admin') {
    throw new Error('FORBIDDEN')
  }
}
