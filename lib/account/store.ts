import 'server-only'

import { eq, sql } from 'drizzle-orm'

import { db, profiles } from '@/lib/db'

/**
 * Upis pristanka za podatke o zdravlju. Prvi trenutak se ne pomera (ponovljen
 * klik ili dva taba). Vraća `false` ako profil ne postoji.
 */
export async function recordHealthConsent(userId: string): Promise<boolean> {
  const rows = await db
    .update(profiles)
    .set({ healthConsentAt: sql`coalesce(${profiles.healthConsentAt}, now())` })
    .where(eq(profiles.id, userId))
    .returning({ id: profiles.id })
  return rows.length > 0
}

/**
 * Briše sve podatke korisnika iz app-a: `profiles` red, a kroz `on delete cascade`
 * i doze, zalihe, kviz, fokus, zadatke, bedževe, push pretplate, notifikacije i
 * Moj stack. `orders` ostaje: to je evidencija prodavnice (vezana mejlom, ne
 * nalogom), a ne podatak koji je korisnik uneo u app. Idempotentno.
 */
export async function deleteProfileData(userId: string): Promise<boolean> {
  const rows = await db.delete(profiles).where(eq(profiles.id, userId)).returning({ id: profiles.id })
  return rows.length > 0
}
