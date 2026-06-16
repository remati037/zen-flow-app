import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="space-y-4">
        <span className="eyebrow">NuroLab</span>
        <h1 className="text-5xl text-ink">ZenFlow</h1>
        <p className="max-w-md text-lg text-slate-mid">
          Tvoj protokol, tvoj fokus, tvoj niz. Companion aplikacija za ZenFlow™
          protokol.
        </p>
      </div>
      <Button asChild variant="lime" className="rounded-full px-8 py-6 text-base">
        <Link href="/style-guide">Pogledaj dizajn sistem</Link>
      </Button>
    </main>
  );
}
