import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ZenFlow — Tvoj protokol, na dohvat ruke",
  description:
    "Companion aplikacija za ZenFlow™ protokol — dnevni habit tracker, alati za fokus i sistem koji čuva niz.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sr" className={hankenGrotesk.variable}>
      <body>{children}</body>
    </html>
  );
}
