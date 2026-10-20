/**
 * Pravni tekstovi i linkovi — čist modul (bez `server-only`), deli ga klijent i server.
 *
 * Pristanak za podatke o zdravlju: doze, zalihe, Focus Score kviz i Moj stack su
 * posebne vrste podataka (ZZPL čl. 17, GDPR čl. 9). Politika privatnosti sama nije
 * dovoljna; traži se izričit pristanak, dat aktivnom radnjom (štikliranje), i
 * povlačenje mora biti jednako lako. Ovde je pristanak uslov korišćenja app-a, jer je
 * praćenje protokola cela usluga, pa je povlačenje = brisanje naloga.
 *
 * Kad se tekst SUŠTINSKI promeni (nova svrha, novi primalac), postojeći pristanci ne
 * pokrivaju novu verziju: tada treba obrisati `profiles.health_consent_at` za sve, pa
 * `/saglasnost` traži ponovnu potvrdu.
 */

/** Šta tačno korisnik potvrđuje. Jedan izvor za onboarding i `/saglasnost`. */
export const HEALTH_CONSENT_STATEMENT =
  'Pristajem da NuroLab obrađuje podatke o zdravlju koje unosim u aplikaciju: uzete doze ZenFlow-a, zalihe, odgovore iz Focus Score kviza i suplemente koje pijem.'

/** Svrha i prava, prikazani uz izjavu. */
export const HEALTH_CONSENT_DETAILS = [
  'Podaci služe za praćenje tvog protokola, podsetnike i procenu fokusa u aplikaciji.',
  'Zbirno i bez podataka po kojima se možeš prepoznati, koriste se i za unapređenje proizvoda.',
  'Ne prodajemo ih i ne delimo ih radi reklama.',
  'Pristanak možeš da povučeš kad god želiš u Podešavanjima, brisanjem naloga. Tada se brišu svi tvoji podaci iz aplikacije.',
] as const

/**
 * Link ka politici privatnosti na nurolab.rs. `null` dok env nije postavljen:
 * pogrešan link (404) je gori od teksta bez linka.
 */
export function privacyPolicyUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL?.trim()
  return url ? url : null
}
