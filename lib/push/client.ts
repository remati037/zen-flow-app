'use client'

import { deletePushSubscription, savePushSubscription } from '@/app/(app)/podesavanja/push-actions'
import { PUSH_ENDPOINT_TAKEN_ERROR } from '@/lib/push/endpoint'

/** Da li trenutni browser uopšte podržava Web Push. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * VAPID public key → Uint8Array (format koji traži `pushManager.subscribe`).
 * Povratni tip je eksplicitno `Uint8Array<ArrayBuffer>`: od TS 5.7 je `Uint8Array`
 * generički nad `ArrayBufferLike`, a `BufferSource` ne prima `SharedArrayBuffer`.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

type PushResult = { ok: boolean; error?: string }

/**
 * Da li je postojeća pretplata napravljena BAŠ ovim VAPID ključem.
 *
 * Zašto je ovo bitno: `pushManager.subscribe` sa drugim `applicationServerKey`
 * na postojećoj pretplati baca `InvalidStateError`, pa je stari kod prosto
 * reciklirao ono što zatekne. Ako je pretplata napravljena STARIM ključem (par
 * je regenerisan, ili je Vercel dobio nov par bez redeploy-a), server je potpisuje
 * novim privatnim ključem i push servis vraća **403 na svako slanje** — zauvek.
 * Pretplata postoji, UI kaže „uključeno", a notifikacija nema. Najtiši mogući otkaz.
 *
 * Vraća `null` kad se ne može utvrditi (browser ne izlaže `options`): tada NE
 * diramo ništa — nasilno odjavljivanje bi bilo gore od hipotetičkog nepoklapanja.
 */
function matchesVapidKey(
  subscription: PushSubscription,
  expected: Uint8Array<ArrayBuffer>,
): boolean | null {
  const raw = subscription.options?.applicationServerKey
  if (!raw) return null

  const actual = new Uint8Array(raw)
  if (actual.length !== expected.length) return false
  return actual.every((byte, i) => byte === expected[i])
}

/**
 * Vrati pretplatu koja SIGURNO nosi trenutni VAPID ključ.
 * Postojeću zadržava kad se ključ poklapa (ili se ne može proveriti); na
 * nepoklapanje je odjavljuje i pravi svežu.
 */
async function ensureSubscription(
  registration: ServiceWorkerRegistration,
  vapidKey: Uint8Array<ArrayBuffer>,
): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription()

  if (existing) {
    if (matchesVapidKey(existing, vapidKey) === false) {
      console.warn('[push] pretplata je napravljena starim VAPID ključem — pravim novu')
      await existing.unsubscribe()
    } else {
      return existing
    }
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidKey,
  })
}

/**
 * Upiši pretplatu na server, sa oporavkom za slučaj deljenog uređaja.
 *
 * `savePushSubscription` odbija endpoint koji već pripada DRUGOM nalogu (server
 * više ne preuzima tuđi red — vidi `push-actions.ts`). To se realno dešava kad se
 * na istom browseru odjavi jedan pa prijavi drugi korisnik: SW registracija je
 * ista, pa je i endpoint isti. Rešenje je da ovaj uređaj dobije SVOJ endpoint:
 * `unsubscribe()` poništava stari kod push servisa, a novi `subscribe()` izdaje
 * nov token. Stari red prvog korisnika se sam počisti kad slanje vrati 410.
 *
 * Pokušava se tačno JEDNOM — ako i sveži endpoint bude „tuđi", to više nije
 * deljen uređaj nego stvarna greška i mora da se vidi.
 */
async function persistSubscription(
  registration: ServiceWorkerRegistration,
  subscription: PushSubscription,
  vapidKey: Uint8Array<ArrayBuffer>,
  allowRetry = true,
): Promise<PushResult> {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, error: 'Neispravna pretplata.' }
  }

  const result = await savePushSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  })

  if (result.ok) return { ok: true }

  if (allowRetry && result.error === PUSH_ENDPOINT_TAKEN_ERROR) {
    await subscription.unsubscribe()
    const fresh = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    })
    return persistSubscription(registration, fresh, vapidKey, false)
  }

  // Zod vraća generično 'Neispravni podaci.' + razlog po polju. Za odbijen
  // endpoint (allowlist push servisa) generična poruka ne kaže ništa upotrebljivo,
  // pa prednost ima poruka polja.
  return { ok: false, error: result.fieldErrors?.endpoint?.[0] ?? result.error }
}

/** Trenutni VAPID javni ključ kao bajtovi, ili `null` ako nije konfigurisan. */
function currentVapidKey(): Uint8Array<ArrayBuffer> | null {
  const raw = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  return raw ? urlBase64ToUint8Array(raw) : null
}

/**
 * Traži dozvolu, pretplati browser na push i perzistira pretplatu u bazi.
 * Vraća `{ ok }` — nikad ne baca ka UI-u.
 */
export async function subscribeToPush(): Promise<PushResult> {
  if (!isPushSupported()) {
    return { ok: false, error: 'Push notifikacije nisu podržane na ovom uređaju.' }
  }

  const vapidKey = currentVapidKey()
  if (!vapidKey) {
    return { ok: false, error: 'Push nije konfigurisan (nedostaje VAPID ključ).' }
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { ok: false, error: 'Dozvola za notifikacije nije data.' }
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await ensureSubscription(registration, vapidKey)
    return persistSubscription(registration, subscription, vapidKey)
  } catch (err) {
    console.error('[push] subscribe neuspešan:', err)
    return { ok: false, error: 'Pretplata nije uspela. Pokušaj ponovo.' }
  }
}

/**
 * Tihi re-upsert pretplate pri ulasku u app.
 *
 * Drugi (i poslednji) sloj odbrane uz `pushsubscriptionchange` u service worker-u.
 * Taj događaj se ne okine uvek: browser ume da ga propusti, SW može biti ubijen,
 * a neki browseri ga isporuče bez `oldSubscription` — pa server ne zna čiju
 * pretplatu da premesti. Rezultat je isti tihi otkaz: browser ima pretplatu,
 * baza nema (ili ima mrtvu), i podsetnici prosto prestanu.
 *
 * Isti poziv leči i suprotan smer: red obrisan iz baze zato što je push servis
 * jednom vratio 410 (npr. uređaj je bio ugašen predugo), dok je pretplata u
 * browseru i dalje živa.
 *
 * NAMERNO pasivno — nikad ne traži dozvolu i nikad ne pravi pretplatu iz ničega.
 * Radi samo kad dozvola već postoji I pretplata već postoji; inače bi ulazak u
 * app vaskrsavao notifikacije koje je korisnik svesno ugasio.
 */
export async function syncPushSubscription(): Promise<PushResult> {
  if (!isPushSupported()) return { ok: true }
  if (Notification.permission !== 'granted') return { ok: true }

  const vapidKey = currentVapidKey()
  if (!vapidKey) return { ok: true }

  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    if (!existing) return { ok: true }

    // Ako je pretplata na starom VAPID ključu, `ensureSubscription` je menja —
    // ovde je to jedini slučaj u kom sync SME da napravi novu (stara je mrtva:
    // svako slanje na nju vraća 403).
    const subscription = await ensureSubscription(registration, vapidKey)
    return persistSubscription(registration, subscription, vapidKey)
  } catch (err) {
    console.error('[push] sinhronizacija pretplate neuspešna:', err)
    return { ok: false, error: 'Sinhronizacija pretplate nije uspela.' }
  }
}

/**
 * Odjavi browser sa push-a i obriši pretplatu iz baze.
 */
export async function unsubscribeFromPush(): Promise<PushResult> {
  if (!isPushSupported()) {
    return { ok: true }
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      return { ok: true }
    }

    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    await deletePushSubscription({ endpoint })
    return { ok: true }
  } catch (err) {
    console.error('[push] unsubscribe neuspešan:', err)
    return { ok: false, error: 'Odjava nije uspela. Pokušaj ponovo.' }
  }
}

/** Da li već postoji aktivna push pretplata u ovom browseru. */
export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  } catch {
    return false
  }
}
