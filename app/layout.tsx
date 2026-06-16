import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
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
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#203849",
          colorPrimaryForeground: "#ECF0F3",
          colorForeground: "#203849",
          colorBackground: "#FFFFFF",
          colorInput: "#FFFFFF",
          colorInputForeground: "#203849",
          borderRadius: "20px",
          fontFamily: "var(--font-sans)",
        },
        elements: {
          formButtonPrimary:
            "bg-ink text-paper hover:bg-slate normal-case shadow-soft",
          card: "shadow-soft rounded-[28px]",
        },
      }}
    >
      <html lang="sr" className={hankenGrotesk.variable}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
