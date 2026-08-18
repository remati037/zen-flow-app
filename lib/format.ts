/**
 * Srpska pluralizacija (latinica). Client-safe.
 *
 * Pravilo: 1, 21, 31… → jednina; 2–4, 22–24… → mala množina; ostalo → velika
 * množina. Izuzetak su 11–14, koji uvek idu u veliku množinu.
 *
 *   pluralSr(1, 'doza', 'doze', 'doza')  → 'doza'
 *   pluralSr(3, 'doza', 'doze', 'doza')  → 'doze'
 *   pluralSr(12, 'doza', 'doze', 'doza') → 'doza'
 */
export function pluralSr(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.trunc(count))
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = n % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
