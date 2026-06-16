/**
 * Jednokratni generator PWA ikona za ZenFlow.
 * Renderuje brendiranu ikonu ("Zen" lime + "Flow" paper na ink pozadini,
 * Hanken Grotesk) i upisuje PNG-ove u public/icons/.
 *
 * Pokretanje:  npx tsx scripts/generate-icons.ts
 * Izlaz se commit-uje — ne regeneriše se na svaki build.
 */
import { ImageResponse } from "next/og";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import React from "react";

const INK = "#203849";
const LIME = "#defe9c";
const PAPER = "#ecf0f3";

const OUT_DIR = join(process.cwd(), "public", "icons");

// Hanken Grotesk (bold) sa Google Fonts kao TTF (stari UA → server vrati ttf, ne woff2).
async function loadFont(): Promise<ArrayBuffer> {
  const api =
    "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@700";
  const css = await fetch(api, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.93 Safari/537.36",
    },
  }).then((r) => r.text());

  const match = css.match(/src:\s*url\((.+?)\)\s*format\('(?:truetype|opentype|woff)'\)/);
  if (!match) throw new Error("Nije pronađen font URL za Hanken Grotesk u Google Fonts CSS-u.");
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

type IconSpec = { file: string; size: number; safePct: number; bg: string };

const ICONS: IconSpec[] = [
  { file: "icon-192.png", size: 192, safePct: 1, bg: INK },
  { file: "icon-512.png", size: 512, safePct: 1, bg: INK },
  // Maskable: tekst u ~80% safe zone, pun ink bleed do ivica.
  { file: "icon-maskable-512.png", size: 512, safePct: 0.8, bg: INK },
  // Apple touch: bez transparentnosti, 180px.
  { file: "apple-touch-icon.png", size: 180, safePct: 1, bg: INK },
];

function iconElement(spec: IconSpec, font: ArrayBuffer) {
  const fontSize = Math.round(spec.size * 0.26 * spec.safePct);
  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: spec.bg,
        fontFamily: "Hanken Grotesk",
        fontWeight: 700,
        lineHeight: 0.92,
        letterSpacing: "-0.04em",
      },
    },
    React.createElement("span", { style: { color: LIME, fontSize } }, "Zen"),
    React.createElement("span", { style: { color: PAPER, fontSize } }, "Flow"),
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const fontData = await loadFont();

  for (const spec of ICONS) {
    const res = new ImageResponse(iconElement(spec, fontData), {
      width: spec.size,
      height: spec.size,
      fonts: [
        { name: "Hanken Grotesk", data: fontData, weight: 700, style: "normal" },
      ],
    });
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(join(OUT_DIR, spec.file), buf);
    console.log(`✓ ${spec.file} (${spec.size}×${spec.size})`);
  }
  console.log("Gotovo — ikone u public/icons/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
