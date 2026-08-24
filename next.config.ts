import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

/**
 * Verzija ručno precache-ovanih ruta. Menja `revision` unosa za `/~offline`, pa
 * novi SW na instalaciji povuče svežu verziju umesto keširane.
 * Bumpuj kad se `app/~offline/page.tsx` promeni — ILI kad se digne Next verzija:
 * minor bump menja inline RSC bootstrap i hasheve `_next/static` chunk-ova u toj
 * stranici, pa bi stara revizija ostavila precache-ovan HTML koji pokazuje na
 * fajlove kojih više nema.
 */
const SW_VERSION = "1.17.0";

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

const isDev = process.env.NODE_ENV === "development";

/**
 * Clerk Frontend API host, izveden iz publishable key-a.
 *
 * Format ključa je `pk_test_<base64(host + "$")>` / `pk_live_<...>`, pa isti kod
 * daje `<slug>.clerk.accounts.dev` u dev-u i `clerk.app.nurolab.rs` u produkciji —
 * bez dodatne env varijable koju bi neko zaboravio da postavi i tako oborio login.
 */
function clerkFrontendApiHost(): string | null {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!pk) return null;
  try {
    const decoded = Buffer.from(pk.replace(/^pk_(test|live)_/, ""), "base64")
      .toString("utf8")
      .replace(/\$$/, "");
    // Prihvati samo nešto što stvarno liči na host — pokvaren ključ ne sme da
    // ubaci smeće u CSP direktivu (browser bi odbacio celu direktivu).
    return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Clerk izvori: izvedeni FAPI host + Clerk-ovi wildcard domeni kao sigurnosna mreža.
 *
 * Wildcard-i ostaju čak i kad izvođenje uspe: Clerk u dev-u učitava `clerk.browser.js`
 * sa `*.clerk.accounts.dev`, a satellite/proxy setup može da doda još jedan host.
 * Sve su Clerk-ovi domeni, pa je cena mala u odnosu na rizik da CSP obori login.
 */
const clerkHost = clerkFrontendApiHost();
const CLERK_SOURCES = [
  ...(clerkHost ? [`https://${clerkHost}`] : []),
  "https://*.clerk.accounts.dev",
  "https://*.clerk.com",
  "https://*.clerk.services",
].join(" ");

/** Cloudflare Turnstile — Clerk bot protection ga učitava u iframe-u. */
const TURNSTILE = "https://challenges.cloudflare.com";

/**
 * Content-Security-Policy.
 *
 * Zašto `'unsafe-inline'` u `script-src`: Next App Router ubacuje inline bootstrap
 * skripte (`self.__next_f.push(...)`) za streaming RSC payload-a. Jedina alternativa
 * je nonce, a nonce se mora generisati po zahtevu u middleware-u — što svaku stranicu
 * gura u dynamic rendering i ubija statičku optimizaciju. Ovde je izbor svestan:
 * host allowlist i dalje blokira UČITAVANJE skripte sa tuđeg domena, `connect-src`
 * blokira exfiltraciju, a `frame-ancestors`/`object-src`/`base-uri` stoje bez ustupka.
 *
 * `'unsafe-eval'` ide SAMO u dev-u (webpack HMR / eval source maps).
 * `style-src 'unsafe-inline'`: Next inline-uje kritični CSS, Clerk ubacuje <style>,
 * a Recharts/motion pišu inline `style=` atribute — bez ovoga UI puca vizuelno.
 */
const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self' ${CLERK_SOURCES}`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${CLERK_SOURCES} ${TURNSTILE}`,
  `style-src 'self' 'unsafe-inline'`,
  // next/font self-hostuje Hanken Grotesk iz `_next/static` — nema Google Fonts hosta.
  `font-src 'self' data:`,
  // `blob:` — Clerk renderuje neke avatare/QR kodove iz blob URL-ova.
  `img-src 'self' data: blob: https://img.clerk.com`,
  `media-src 'self'`,
  // Push subscribe NE ide kroz fetch (browser interno), pa push servisi ne treba
  // da budu ovde. U dev-u `ws:` je za HMR socket.
  `connect-src 'self' ${CLERK_SOURCES} https://clerk-telemetry.com${isDev ? " ws: http://localhost:*" : ""}`,
  // Serwist SW je same-origin; `blob:` je za Clerk-ove worker-e.
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `frame-src 'self' ${TURNSTILE}`,
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  // Skida `X-Powered-By: Next.js` — besplatna informacija napadaču o stacku i verziji.
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Sve rute, uključujući `/api/*`, `/sw.js` i `/manifest.webmanifest`.
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Redundantno uz `frame-ancestors 'none'`, ali stariji browseri znaju samo ovo.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // App ne koristi nijedan od ovih senzora; gašenje važi i za iframe-ove u njemu.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
