import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZenFlow — NuroLab Companion",
    short_name: "ZenFlow",
    description:
      "Tvoj dnevni ZenFlow protokol, fokus alati i streak na dohvat ruke.",
    start_url: "/",
    display: "standalone",
    background_color: "#ecf0f3", // paper
    theme_color: "#203849", // ink
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
