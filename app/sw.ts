import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Lista fajlova za precache koju Serwist injektuje na build-u.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// ────────────────────────────────────────────────────────────
// Web Push (Korak 1.8)
// ────────────────────────────────────────────────────────────

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
};

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    // Ako payload nije JSON, tretiraj ceo tekst kao telo poruke.
    payload = { body: event.data?.text() };
  }

  const title = payload.title ?? "NuroLab";
  const url = payload.url ?? "/dashboard";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? "",
      // `tag` spaja notifikacije istog tipa → nema gomilanja duplikata.
      tag: payload.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url ?? "/dashboard";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Ako je app već otvoren, fokusiraj postojeći prozor i navigiraj ka cilju.
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && targetUrl) {
            await client.navigate(targetUrl).catch(() => undefined);
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});

// ────────────────────────────────────────────────────────────
// Rotacija pretplate (Faza 2, blok 2 — P-M1)
// ────────────────────────────────────────────────────────────

/** Ruta koja premešta pretplatu na nov endpoint. Vidi `app/api/push/rotate/route.ts`. */
const ROTATE_URL = "/api/push/rotate";

/**
 * VAPID public key → Uint8Array (format koji traži `pushManager.subscribe`).
 * Tip je `Uint8Array<ArrayBuffer>`, ne goli `Uint8Array`: od TS 5.7 je generički
 * nad `ArrayBufferLike`, a `BufferSource` ne prima `SharedArrayBuffer`.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = self.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/**
 * Nabavi `applicationServerKey` za novu pretplatu.
 *
 * Redosled nije proizvoljan — ide od najpouzdanijeg izvora ka najskupljem:
 *  1. `oldSubscription.options.applicationServerKey` — ključ kojim je stara
 *     pretplata NAPRAVLJENA. Najtačniji: nova pretplata mora da nosi isti ključ,
 *     inače server (koji potpisuje privatnim parom) dobija 403 na svako slanje.
 *  2. `/api/push/rotate` (GET) — kad browser ne popuni `oldSubscription`
 *     (Chrome to istorijski nije radio). Ključ je javan, ruta ga samo servira.
 *
 * `process.env` se ovde NE koristi: SW se kompajlira zasebnim Serwist prolazom
 * i oslanjanje na inline-ovanje env-a bi bilo tiho lomljivo — a tihi otkaz je
 * upravo ono što ovaj handler treba da ukloni.
 */
async function resolveApplicationServerKey(
  oldSubscription: PushSubscription | null,
): Promise<BufferSource | null> {
  const fromOld = oldSubscription?.options?.applicationServerKey;
  if (fromOld && fromOld.byteLength > 0) return fromOld;

  try {
    const res = await fetch(ROTATE_URL, { method: "GET" });
    if (!res.ok) return null;
    const data = (await res.json()) as { vapidPublicKey?: string | null };
    return data.vapidPublicKey ? urlBase64ToUint8Array(data.vapidPublicKey) : null;
  } catch {
    return null;
  }
}

/**
 * `pushsubscriptionchange` — push servis je poništio endpoint i traži novu pretplatu.
 *
 * Bez ovoga korisnik TIHO gubi push zauvek: browser odbaci staru pretplatu, server
 * o tome ne sazna, a u bazi ostaje mrtav red koji na svako slanje vraća 410.
 * Nijedan ekran to ne pokazuje — podsetnici prosto prestanu da stižu.
 *
 * Neki browseri već isporuče gotovu `newSubscription`; ostali očekuju da je SW
 * sam napravi. Pokrivamo oba, pa server-u šaljemo par (stari endpoint, nova
 * pretplata) — stari endpoint je ujedno i dokaz identiteta, jer u SW kontekstu
 * Clerk sesije po pravilu nema (vidi komentar u ruti).
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  const changeEvent = event as PushSubscriptionChangeEvent;

  event.waitUntil(
    (async () => {
      const oldEndpoint = changeEvent.oldSubscription?.endpoint;
      if (!oldEndpoint) {
        // Bez starog endpoint-a server ne zna čija je pretplata bila, a pogađati
        // ne sme. Re-upsert pri sledećem otvaranju app-a (`syncPushSubscription`
        // u `lib/push/client.ts`) je rezervni put za baš ovaj slučaj.
        console.warn("[sw] pushsubscriptionchange bez oldSubscription — rotacija preskočena");
        return;
      }

      let subscription = changeEvent.newSubscription ?? null;

      if (!subscription) {
        const applicationServerKey = await resolveApplicationServerKey(
          changeEvent.oldSubscription,
        );
        if (!applicationServerKey) {
          console.error("[sw] nema VAPID ključa — nova pretplata nije napravljena");
          return;
        }
        subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

      await fetch(ROTATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldEndpoint,
          subscription: {
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          },
        }),
      });
    })().catch((err) => {
      // `waitUntil` sa odbijenim promise-om ne pomaže nikome — događaj se ne
      // ponavlja. Log je jedini trag; oporavak nosi re-upsert na app load.
      console.error("[sw] rotacija pretplate neuspešna:", err);
    }),
  );
});
