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
