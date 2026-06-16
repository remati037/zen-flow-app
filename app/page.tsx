import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";

export default async function Home() {
  // Ako je korisnik već prijavljen, vodi ga pravo u app (gejt u (app)/layout.tsx
  // dalje odlučuje dashboard vs. /nemas-pristup).
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-paper px-6 py-12 text-center">
      <div className="space-y-4">
        <span className="eyebrow">NuroLab</span>
        <h1 className="text-5xl text-ink">ZenFlow</h1>
        <p className="mx-auto max-w-md text-lg text-slate-mid">
          Tvoj protokol, tvoj fokus, tvoj niz. Companion aplikacija za ZenFlow™
          protokol — prati doslednost, čuvaj zalihe i ostani u nizu.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button asChild variant="lime" size="lg" className="rounded-full py-6 text-base">
          <Link href="/sign-up">Registruj se</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full py-6 text-base">
          <Link href="/sign-in">Prijavi se</Link>
        </Button>
      </div>

      <p className="max-w-sm text-sm text-slate-mid">
        Pristup imaju ZenFlow kupci — registruj se mejlom koji si koristio pri
        kupovini na nurolab.rs.
      </p>
    </main>
  );
}
