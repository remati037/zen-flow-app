/** Grupe od 1–2 korisnika se ne prikazuju brojem (zaštita od identifikacije u maloj bazi). */
export const MIN_GROUP_SIZE = 3

/** `null` = „< 3". Nula je bezbedna i prikazuje se kao nula. */
export function maskSmallGroup(n: number): number | null {
  return n > 0 && n < MIN_GROUP_SIZE ? null : n
}
