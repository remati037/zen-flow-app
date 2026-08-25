/**
 * Odluka o pristupu — čista funkcija, bez DB i bez `server-only`.
 *
 * Izdvojeno iz `lib/access/status.ts` iz istog razloga iz kog postoje
 * `lib/woocommerce/order-rules.ts` i `lib/cron/health.ts`: `status.ts` je
 * `server-only` i uvlači Drizzle klijent, pa ga `scripts/qa-dates.mts` ne može
 * importovati. A upravo je ovo pravilo koje MORA da bude pokriveno testom —
 * prioritet role, override-a, pretplate i prozora porudžbine je jedina stvar
 * koja odlučuje da li korisnik ulazi u aplikaciju.
 *
 * `status.ts` sve odavde re-eksportuje, pa pozivaoci ne moraju da znaju za ovaj fajl.
 */

import type { accessStatusEnum } from '@/lib/db/schema'
import { isWithinAccessWindow } from '@/lib/access/window'
import { toBelgradeIso } from '@/lib/dates'

/**
 * `import type` iznad je namerno — tip se izvodi iz enum-a u šemi (jedan izvor
 * istine za dozvoljene vrednosti), ali se pri kompilaciji briše, pa ovaj modul
 * u runtime-u ne uvlači ni Drizzle ni `lib/db/index.ts` (koji baca bez `DATABASE_URL`).
 */
export type AccessStatus = (typeof accessStatusEnum.enumValues)[number]
export type Role = 'admin' | 'user'

/** Vrednosti koje admin sme ručno da nametne. `subscriber` nije među njima — vidi šemu. */
export type AccessOverride = 'vip' | 'inactive'

/**
 * Suzi vrednost iz baze na dozvoljeni override.
 *
 * Kolona `access_override` deli enum sa `access_status` (jedan tip, jedna
 * migracija), pa TypeScript vidi i `subscriber`. CHECK u bazi ga zabranjuje, ali
 * kod se ne oslanja na to: neočekivana vrednost ovde postaje `null` (= nema
 * override-a) umesto da procuri u odluku o pristupu.
 */
export function asOverride(value: AccessStatus | null | undefined): AccessOverride | null {
  return value === 'vip' || value === 'inactive' ? value : null
}

/**
 * Odluči `access_status` iz uloge, ručnog override-a i poslednje porudžbine.
 *
 * Prioritet:
 * 1. `admin` → uvek `vip` (admin nikad ne gubi pristup, čak i bez porudžbina).
 * 2. `override` → tačno ta vrednost, bez obzira na porudžbine (L-M2).
 * 3. `subscriber` → ostaje `subscriber` (Faza 2 / Stripe; ova logika ga ne dira).
 * 4. Inače: porudžbina u prozoru pristupa → `vip`, u suprotnom `inactive`.
 *
 * Zašto je override IZNAD porudžbina, a ISPOD role: override postoji baš da nadjača
 * ono što `orders` kaže (podrška pušta kupca čija porudžbina nije stigla, ili gasi
 * zloupotrebljen nalog). Admina ne dira jer je rola izvor istine i za middleware —
 * override koji zaključa admina van `/admin` bi bio nepovratan iz same aplikacije.
 *
 * Prozor se meri u beogradskim kalendarskim danima (`isWithinAccessWindow`), ne u
 * milisekundama — inače satnica porudžbine i DST prelaz pomeraju granicu za sat/dan,
 * pa se VIP gasi dok streak taj dan još smatra pokrivenim.
 */
export function resolveAccessStatus(params: {
  role: Role
  currentStatus: AccessStatus
  latestOrderDate: Date | null
  now: Date
  /** `profiles.access_override` — `null` kad override-a nema (normalno stanje). */
  override?: AccessOverride | null
}): AccessStatus {
  const { role, currentStatus, latestOrderDate, now, override = null } = params

  if (role === 'admin') return 'vip'
  if (override) return override
  if (currentStatus === 'subscriber') return 'subscriber'

  if (latestOrderDate && isWithinAccessWindow(toBelgradeIso(latestOrderDate), toBelgradeIso(now))) {
    return 'vip'
  }
  return 'inactive'
}
