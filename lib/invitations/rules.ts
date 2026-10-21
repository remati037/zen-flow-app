/**
 * Pravila pozivnica — čist modul, bez `server-only` i bez Clerk-a, da ga
 * `scripts/qa-dates.mts` može importovati.
 *
 * MODEL: Clerk je u **Restricted** sign-up modu (Dashboard → Restrictions), pa
 * se nalog može napraviti SAMO kroz Clerk invitation link. Gejt je zato na nivou
 * Clerk-a, ne naše forme — direktan FAPI poziv mimo `/sign-up` stranice Clerk
 * odbija sam. Postoje dve vrste pozivnice i obe idu istim putem:
 *
 *  - `admin` — admin poziva nekoga BEZ obzira na porudžbine. Pri registraciji
 *    nalog dobija trajan `access_override = 'vip'` (isti mehanizam kao ručni
 *    override u adminu, skida se sa „Vrati automatiku").
 *  - `buyer` — kupac sam traži link na `/sign-up`. Izdaje se samo ako mejl ima
 *    validnu porudžbinu u `orders`; pristup posle registracije i dalje odlučuje
 *    prozor porudžbine (nema override-a).
 *
 * Vrsta putuje kroz `publicMetadata` pozivnice, koju Clerk pri registraciji
 * prepiše u `publicMetadata` korisnika. `publicMetadata` se piše SAMO iz Backend
 * API-ja, pa korisnik ne može sam sebi da „dodeli" admin pozivnicu.
 */

export const INVITE_KINDS = ['admin', 'buyer'] as const
export type InviteKind = (typeof INVITE_KINDS)[number]

export type InviteMetadata = { kind: InviteKind; by: string | null }

/** Admin pozivnica važi duže — šalje se ljudima koji je ne čekaju odmah. */
export const ADMIN_INVITE_EXPIRES_DAYS = 14
/** Kupčev link je odgovor na zahtev koji je upravo poslao — kratak rok je dovoljan. */
export const BUYER_INVITE_EXPIRES_DAYS = 3

/**
 * Koliko minuta posle poslatog linka kupac NE dobija nov na ponovljen zahtev.
 *
 * Forma je javna i ne otkriva ko je kupac, pa bez ovoga bilo ko može da ukuca
 * tuđ mejl sto puta i kupcu napuni inbox. Unutar cooldown-a odgovor je isti
 * („proveri mejl"), samo se ništa ne šalje.
 */
export const BUYER_INVITE_COOLDOWN_MIN = 10

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** `publicMetadata` koja ide uz Clerk pozivnicu (i završi na korisniku). */
export function inviteMetadata(kind: InviteKind, by: string | null) {
  return { role: 'user' as const, invite: { kind, by } }
}

/**
 * Izvuci vrstu pozivnice iz `public_metadata` (korisnika ili pozivnice).
 * Sve što nije tačno naš oblik → `null` (nalog nije došao preko pozivnice ili je
 * metadata ručno menjana u Dashboard-u) — nikad ne pogađamo `admin`.
 */
export function parseInviteMetadata(metadata: unknown): InviteMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null
  const invite = (metadata as Record<string, unknown>).invite
  if (!invite || typeof invite !== 'object') return null
  const { kind, by } = invite as Record<string, unknown>
  if (kind !== 'admin' && kind !== 'buyer') return null
  return { kind, by: typeof by === 'string' && by.length > 0 ? by : null }
}

/**
 * Sme li se kupcu poslati NOV link, s obzirom na postojeću pending pozivnicu.
 * Bez pending pozivnice uvek sme; sa njom tek kad prođe cooldown.
 */
export function canReissueBuyerInvite(existingCreatedAtMs: number | null, nowMs: number): boolean {
  if (existingCreatedAtMs === null) return true
  return nowMs - existingCreatedAtMs >= BUYER_INVITE_COOLDOWN_MIN * 60_000
}

/**
 * Jedinstven odgovor javne forme — ISTI za kupca, ne-kupca i postojeći nalog.
 * Različit odgovor bi formu pretvorio u alat za proveru „da li je X kupio ZenFlow".
 */
export const SIGN_UP_REQUEST_MESSAGE =
  'Ako je ovaj mejl u našoj bazi kupaca, za par minuta stiže ti link za registraciju. Ako već imaš nalog, samo se prijavi.'
