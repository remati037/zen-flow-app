import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { clerkLocalization } from "@/lib/clerk-localization";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ZenFlow · Tvoj dnevni protokol",
  description:
    "Aplikacija za ZenFlow™ protokol. Beleži doze, prati zalihe i radi u fokusu.",
  applicationName: "ZenFlow",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ZenFlow",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Paper, ne ink: header je svetao, pa bi tamna traka iznad njega (Android
  // adresna traka / iOS status bar) izgledala kao greška.
  themeColor: "#ECF0F3",
  // App je namerno samo svetla — bez ovoga Android Chrome „auto-dark" invertuje
  // brand boje (lime postaje blatnjav, ink beo) i kontrast puca.
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      localization={clerkLocalization}
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
      <html lang="sr-Latn" className={hankenGrotesk.variable}>
        <body>
          {children}
          <Toaster richColors position="top-center" />
        </body>
      </html>
    </ClerkProvider>
  );
}
