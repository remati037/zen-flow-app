/**
 * Pravila WooCommerce porudžbina — čista logika, bez DB i bez `server-only`.
 *
 * Zašto odvojen fajl: `sync.ts` povlači `server-only` + `lib/db`, pa se ne može
 * importovati iz QA harness-a (`scripts/qa-dates.mts`). Sve što je odlučivanje
 * (koji status vredi, koji je datum porudžbine, da li je red stvarno insertovan)
 * živi ovde i testira se direktno.
 */

/**
 * Statusi koji se računaju kao **validna kupovina** za pristup (VIP prozor,
 * coverage za streak, prefil pakovanja). `processing` = plaćeno, `completed` = poslato.
 *
 * Svaki upit koji iz `orders` izvodi PRISTUP mora da filtrira po ovoj listi —
 * inače refundirana porudžbina i dalje drži korisnika VIP-om 60 dana.
 * (Admin prikaz porudžbina namerno NE filtrira — tamo se vide svi statusi.)
 */
export const SYNCED_STATUSES = ['processing', 'completed'] as const

/**
 * Statusi koji **opozivaju** ranije sinhronizovanu porudžbinu.
 * Za njih ne pravimo novi red — samo ažuriramo status postojećeg, pa pristupna
 * logika prestaje da ih broji.
 *
 * `failed` je ovde jer je to plaćanje koje nije prošlo (isti efekat kao otkazivanje).
 * `pending`/`on-hold` NISU ovde — to su pred-plaćanja stanja, ne opoziv; ona padaju
 * u `ignored` i ne diraju postojeći red.
 */
export const REVOKED_STATUSES = ['cancelled', 'refunded', 'failed'] as const

export type SyncedStatus = (typeof SYNCED_STATUSES)[number]
export type RevokedStatus = (typeof REVOKED_STATUSES)[number]

/** Klasa statusa: sinhronizuj / opozovi / ignoriši. */
export type StatusClass = 'synced' | 'revoked' | 'ignored'

/** Woo status → klasa. Nepoznat status je `ignored` (nikad ne dira bazu). */
export function classifyOrderStatus(status: string): StatusClass {
  const normalized = status.trim().toLowerCase()
  if ((SYNCED_STATUSES as readonly string[]).includes(normalized)) return 'synced'
  if ((REVOKED_STATUSES as readonly string[]).includes(normalized)) return 'revoked'
  return 'ignored'
}

/** Da li status daje pristup (VIP / coverage). */
export function isAccessGrantingStatus(status: string): boolean {
  return classifyOrderStatus(status) === 'synced'
}

/**
 * Parsira Woo GMT datum (`date_paid_gmt` / `date_created_gmt`).
 *
 * Woo šalje GMT polja **bez oznake zone** (`'2026-08-24T21:30:00'`). `new Date()`
 * nad takvim stringom parsira kao LOKALNO vreme procesa — na Vercelu (UTC) slučajno
 * tačno, lokalno u Beogradu pomereno za sat-dva. Zato eksplicitno lepimo `Z`.
 *
 * Vraća `null` za prazno/`null`/nevalidno.
 */
export function parseWooGmtDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // Woo ume da pošalje i '0000-00-00 00:00:00' za neplaćene porudžbine.
  if (trimmed.startsWith('0000-')) return null

  // Ako zona već postoji (Z ili ±HH:MM), ne diraj je; inače normalizuj razmak → 'T' i dodaj 'Z'.
  const hasZone = /(?:Z|z|[+-]\d{2}:?\d{2})$/.test(trimmed)
  const normalized = hasZone ? trimmed.replace(' ', 'T') : `${trimmed.replace(' ', 'T')}Z`

  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Fallback za payload-e bez `*_gmt` polja (stariji Woo / ručno slat JSON).
 *
 * Ova polja su u **lokalnoj zoni prodavnice**, koju iz payload-a ne znamo — parsiramo
 * ih kako jesu i prihvatamo mogući pomak od sat-dva. Zato su strogo fallback:
 * GMT polja uvek imaju prioritet.
 */
function parseWooLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('0000-')) return null
  const date = new Date(trimmed.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Polja datuma koja `resolveOrderDate` gleda (podskup `wooOrderSchema`). */
export type WooOrderDateFields = {
  date_paid_gmt?: string | null
  date_created_gmt?: string | null
  date_paid?: string | null
  date_created?: string | null
}

/**
 * Datum porudžbine: prioritet plaćanju, pa kreiranju; GMT polja pre lokalnih.
 * Ako ničega nema → `fallback` (podrazumevano „sada").
 *
 * Bitno jer se `orders.orderDate` kroz `toBelgradeIso()` pretvara u beogradski dan —
 * porudžbina u 23:30 po Beogradu mora da padne u TAJ dan, ne u sledeći/prethodni.
 */
export function resolveOrderDate(order: WooOrderDateFields, fallback: Date = new Date()): Date {
  return (
    parseWooGmtDate(order.date_paid_gmt) ??
    parseWooGmtDate(order.date_created_gmt) ??
    parseWooLocalDate(order.date_paid) ??
    parseWooLocalDate(order.date_created) ??
    fallback
  )
}

/**
 * Da li je `RETURNING (xmax = 0)` iz `onConflictDoUpdate` rekao „ovo je INSERT".
 *
 * Postgres trik: `xmax` je 0 za sveže insertovan red, a != 0 za red koji je upravo
 * ažuriran kroz ON CONFLICT. Time se insert/update razlikuje **unutar iste izjave**,
 * bez select-pa-insert trke (dva paralelna webhook-a → samo jedan dobija `true`).
 *
 * Drajveri vraćaju bool različito (boolean / 't' / 'true' / 1), pa koercujemo ručno.
 * Nepoznata vrednost → `false` (radije propušten top-up nego dupli).
 */
export function wasInserted(flag: unknown): boolean {
  if (typeof flag === 'boolean') return flag
  if (typeof flag === 'number') return flag === 1
  if (typeof flag === 'string') {
    const v = flag.trim().toLowerCase()
    return v === 't' || v === 'true' || v === '1'
  }
  return false
}
