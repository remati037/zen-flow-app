import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — ZenFlow",
};

// Mora biti statična (bez data fetchinga) da bi je service worker precache-ovao
// i poslužio kao fallback kad nema mreže.
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-6 text-center">
      <span className="eyebrow">ZenFlow protokol</span>

      <div className="flex flex-col items-center gap-3">
        <h1 className="text-3xl font-medium text-ink sm:text-4xl">
          Trenutno si offline
        </h1>
        <p className="max-w-sm text-slate-soft">
          Nema veze sa internetom. Tvoj protokol te čeka — vrati se čim ponovo
          budeš online i streak ostaje netaknut.
        </p>
      </div>

      <span
        aria-hidden
        className="mt-2 inline-block h-2 w-2 rounded-full bg-lime"
      />
    </main>
  );
}
