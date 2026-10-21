/**
 * Bazni URL aplikacije — za apsolutne linkove u mejlovima i odjavnim zaglavljima.
 *
 * Zaseban, ČIST modul (bez `server-only`): `lib/email/client.ts` je server-only
 * zbog Resend ključa, pa bi svaki modul kome treba samo URL preko njega povukao i
 * ceo mejl klijent — uključujući `scripts/qa-dates.mts`, koji bi tada pucao.
 * `lib/email/client.ts` ga re-eksportuje, pa postojeći pozivaoci ostaju isti.
 *
 * Redosled:
 *  1. `NEXT_PUBLIC_APP_URL` — eksplicitno podešavanje uvek pobeđuje.
 *  2. Vercel produkcijski domen (`VERCEL_PROJECT_PRODUCTION_URL`, sistemska
 *     varijabla bez šeme; na produkciji je to custom domen, npr. app.nurolab.rs).
 *     Bez ovoga zaboravljen `NEXT_PUBLIC_APP_URL` šalje linkove na localhost —
 *     pozivnica koja vodi na `http://localhost:3000/sign-up` je mrtav link.
 *  3. localhost — samo lokalni razvoj.
 */
export function resolveAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/+$/, '')

  const vercelProd =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
  if (vercelProd) return `https://${vercelProd.replace(/\/+$/, '')}`

  return 'http://localhost:3000'
}

export const APP_URL = resolveAppUrl()
