/**
 * Allowlist hostova Web Push servisa.
 *
 * Endpoint pretplate dolazi iz browsera, ali stiže do servera kao OBIČAN STRING u
 * telu server akcije — klijent može da pošalje bilo šta. `web-push` zatim radi POST
 * na tu adresu iz našeg runtime-a, sa našim VAPID potpisom: to je blind SSRF primitiv
 * (interni servisi, metadata endpointi cloud providera, port scan preko tajminga).
 *
 * Zato endpoint mora da pogodi poznati push servis. Modul je namerno bez
 * `server-only` — koriste ga i zod šema (koju povlači 'use server' modul dostupan
 * klijentu) i `lib/push/send.ts`.
 */

/** Hostovi koji moraju da se poklope tačno. */
const EXACT_HOSTS = new Set([
  // Chrome / Chromium / Edge (Chromium) / Samsung Internet / Brave → FCM
  'fcm.googleapis.com',
  // Safari (macOS + iOS 16.4+, PWA dodat na Home Screen)
  'web.push.apple.com',
  // Firefox (desktop + Android) — autopush
  'updates.push.services.mozilla.com',
])

/**
 * Sufiksi za servise sa regionalnim pod-domenima.
 * WNS (Windows/Edge legacy) daje hostove tipa `wns2-par02p.notify.windows.com`,
 * pa se tu ne može nabrojati tačan host.
 */
const HOST_SUFFIXES = ['.notify.windows.com']

/** Endpoint-i su tokeni push servisa; realno < 1 KB. Kapa štiti od DB abuse-a. */
export const MAX_PUSH_ENDPOINT_LENGTH = 1024

/**
 * Endpoint već pripada DRUGOM nalogu.
 *
 * Poruka je i PROTOKOL, ne samo tekst: `lib/push/client.ts` je poredi sa
 * `result.error` da bi znao da treba da odjavi pretplatu i napravi svežu (push
 * servis pri novom `subscribe()` izdaje nov endpoint). Zato je konstanta, i zato
 * živi u ovom modulu — jedinom koji smeju da uvezu i klijent i server.
 */
export const PUSH_ENDPOINT_TAKEN_ERROR =
  'Ova push pretplata je vezana za drugi nalog. Osvežavamo je — pokušaj ponovo za par sekundi.'

export const PUSH_ENDPOINT_ERROR =
  'Endpoint pretplate ne pripada nijednom poznatom push servisu (Google/Apple/Mozilla/Microsoft). Pretplata je odbijena.'

/**
 * Da li je `endpoint` https URL ka poznatom push servisu.
 * Odbija sve ostalo — uključujući http, custom portove i user:pass u URL-u
 * (klasični trikovi za zaobilaženje host provere).
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > MAX_PUSH_ENDPOINT_LENGTH) return false

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }

  if (url.protocol !== 'https:') return false
  // Nestandardan port na push servisu ne postoji; `url.port` je '' za default 443.
  if (url.port !== '') return false
  // `https://fcm.googleapis.com@attacker.tld/` — host je attacker.tld, ali neki
  // naivni parseri to promaše. Odbijamo credentials u URL-u bez razmišljanja.
  if (url.username !== '' || url.password !== '') return false

  const host = url.hostname.toLowerCase()
  if (EXACT_HOSTS.has(host)) return true
  return HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}
