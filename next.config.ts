import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

/**
 * Verzija ručno precache-ovanih ruta. Menja `revision` unosa za `/~offline`, pa
 * novi SW na instalaciji povuče svežu verziju umesto keširane.
 * Bumpuj kad se `app/~offline/page.tsx` promeni.
 */
const SW_VERSION = "1.16.0";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // SW se ne registruje u dev-u — PWA se testira na `next build && next start`
  disable: process.env.NODE_ENV === "development",
  /**
   * `/~offline` je server-renderovana ruta, pa je Serwist ne pokupi sam —
   * precache manifest pokriva samo `.next/static` i `public/`. Bez ovog unosa
   * fallback iz `app/sw.ts` zove `matchPrecache('/~offline')`, ne nađe ključ i
   * offline ekran se NIKAD ne prikaže (korisnik dobije browser-ov error).
   *
   * Ide kroz `manifestTransforms`, a NE kroz `additionalPrecacheEntries` — ta
   * opcija u @serwist/next ZAMENJUJE glob nad `public/`, pa bi izbacila ikone
   * i manifest ikonice iz precache-a. `size` je obavezno polje šeme; 0 je ovde
   * bezazleno — koristi se samo za izveštaj o veličini precache-a.
   */
  manifestTransforms: [
    async (entries) => ({
      manifest: [...entries, { url: "/~offline", revision: SW_VERSION, size: 0 }],
      warnings: [],
    }),
  ],
});

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSerwist(nextConfig);
