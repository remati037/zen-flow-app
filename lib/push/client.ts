'use client'

import { deletePushSubscription, savePushSubscription } from '@/app/(app)/podesavanja/push-actions'

/** Da li trenutni browser uopšte podržava Web Push. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** VAPID public key → Uint8Array (format koji traži `pushManager.subscribe`). */
function urlBase64ToUint8Array(base64String: string) {
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
 * Traži dozvolu, pretplati browser na push i perzistira pretplatu u bazi.
 * Vraća `{ ok }` — nikad ne baca ka UI-u.
 */
export async function subscribeToPush(): Promise<PushResult> {
  if (!isPushSupported()) {
    return { ok: false, error: 'Push notifikacije nisu podržane na ovom uređaju.' }
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    return { ok: false, error: 'Push nije konfigurisan (nedostaje VAPID ključ).' }
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { ok: false, error: 'Dozvola za notifikacije nije data.' }
    }

    const registration = await navigator.serviceWorker.ready

    // Ako pretplata već postoji, iskoristi je; inače napravi novu.
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      }))

    const json = subscription.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, error: 'Neispravna pretplata.' }
    }

    const result = await savePushSubscription({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    })

    if (!result.ok) {
      return { ok: false, error: result.error }
    }
    return { ok: true }
  } catch (err) {
    console.error('[push] subscribe neuspešan:', err)
    return { ok: false, error: 'Pretplata nije uspela. Pokušaj ponovo.' }
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
