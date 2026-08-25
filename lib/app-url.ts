/**
 * Bazni URL aplikacije — za apsolutne linkove u mejlovima i odjavnim zaglavljima.
 *
 * Zaseban, ČIST modul (bez `server-only`): `lib/email/client.ts` je server-only
 * zbog Resend ključa, pa bi svaki modul kome treba samo URL preko njega povukao i
 * ceo mejl klijent — uključujući `scripts/qa-dates.mts`, koji bi tada pucao.
 * `lib/email/client.ts` ga re-eksportuje, pa postojeći pozivaoci ostaju isti.
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
