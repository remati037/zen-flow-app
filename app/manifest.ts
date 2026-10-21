import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZenFlow by NuroLab",
    short_name: "ZenFlow",
    description:
      "Tvoj dnevni ZenFlow protokol, niz i alati za fokus na jednom mestu.",
    // Pravo na dashboard: `/` za ulogovanog korisnika samo preusmerava — jedan
    // round-trip manje pri svakom otvaranju instalirane aplikacije.
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ecf0f3", // paper
    theme_color: "#ECF0F3", // paper — isto kao `viewport.themeColor`
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
