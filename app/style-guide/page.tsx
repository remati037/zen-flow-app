import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "Style Guide — ZenFlow",
};

const colors = [
  { name: "paper", value: "#ECF0F3", role: "pozadina", dark: false },
  { name: "white", value: "#FFFFFF", role: "kartice", dark: false },
  { name: "ink", value: "#203849", role: "tekst / tamna dugmad", dark: true },
  { name: "slate", value: "#304F60", role: "—", dark: true },
  { name: "slate-mid", value: "#445662", role: "sekundarni tekst", dark: true },
  { name: "slate-soft", value: "#597080", role: "eyebrow", dark: true },
  { name: "lime", value: "#DEFE9C", role: "akcenat / CTA", dark: false },
  { name: "lime-deep", value: "#DCF39E", role: "—", dark: false },
  { name: "lime-soft", value: "#F0FFD0", role: "—", dark: false },
  { name: "mint", value: "#D3FBD8", role: "—", dark: false },
];

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="text-2xl text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function StyleGuidePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 space-y-16">
      {/* Header */}
      <header className="space-y-4">
        <span className="eyebrow">NuroLab · Dizajn sistem</span>
        <h1 className="text-5xl text-ink">ZenFlow Style Guide</h1>
        <p className="max-w-2xl text-lg text-slate-mid">
          Clean i premium. Paper pozadina, bele kartice sa mekim senkama, lime
          kao jedini jak akcenat, dosta vazduha i zaobljeni radijusi.
        </p>
      </header>

      {/* Boje */}
      <Section eyebrow="Tokeni" title="Paleta boja">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {colors.map((c) => (
            <div
              key={c.name}
              className="overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-soft"
            >
              <div
                className="h-20 w-full"
                style={{ background: c.value }}
              />
              <div className="space-y-0.5 p-3">
                <p className="text-sm font-medium text-ink">{c.name}</p>
                <p className="text-xs text-slate-soft">{c.value}</p>
                <p className="text-xs text-slate-soft">{c.role}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Tipografija */}
      <Section eyebrow="Tip" title="Tipografija — Hanken Grotesk">
        <div className="space-y-6 rounded-lg border border-[var(--line)] bg-white p-8 shadow-soft">
          <span className="eyebrow">Eyebrow · uppercase · tracking .14em</span>
          <div className="space-y-3">
            <h1 className="text-5xl text-ink">Naslov H1 — fokus i jasnoća</h1>
            <h2 className="text-3xl text-ink">Naslov H2 — tvoj niz raste</h2>
            <h3 className="text-2xl text-ink">Naslov H3 — dnevni protokol</h3>
          </div>
          <p className="max-w-2xl text-base text-slate-mid">
            Body tekst (line-height 1.55). ZenFlow ne radi na trikove — radi
            tako što ga piješ svaki dan, a efekat se gradi dozu po dozu, dan po
            dan. Naslovi su weight 500 sa negativnim letter-spacing-om.
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-slate-soft">
            <span className="font-light">Light 300</span>
            <span className="font-normal">Regular 400</span>
            <span className="font-medium">Medium 500</span>
            <span className="font-semibold">Semibold 600</span>
            <span className="font-bold">Bold 700</span>
          </div>
        </div>
      </Section>

      {/* Dugmad */}
      <Section eyebrow="Forme" title="Dugmad (pill 999px)">
        <div className="space-y-8 rounded-lg border border-[var(--line)] bg-white p-8 shadow-soft">
          <div className="space-y-3">
            <p className="text-sm text-slate-soft">
              shadcn Button — brend varijante
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="lime" className="rounded-full px-6">
                Popij jutarnju dozu
              </Button>
              <Button variant="dark" className="rounded-full px-6">
                Otvori protokol
              </Button>
              <Button variant="outline" className="rounded-full px-6">
                Detalji
              </Button>
              <Button variant="ghost" className="rounded-full px-6">
                Preskoči
              </Button>
              <Button variant="lime" className="rounded-full px-6" disabled>
                Disabled
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-slate-soft">
              Referentne primitivne klase (.btn-*)
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button className="btn-dark">btn-dark</button>
              <button className="btn-lime">btn-lime</button>
              <button className="btn-ghost">btn-ghost</button>
            </div>
          </div>
        </div>
      </Section>

      {/* Kartice + senke */}
      <Section eyebrow="Elevacija" title="Kartice i senke">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg bg-white p-8 shadow-soft">
            <span className="eyebrow">Shadow soft</span>
            <p className="mt-3 text-lg text-ink">Radius 20px · meka senka</p>
            <p className="mt-1 text-sm text-slate-soft">
              0 6px 30px rgba(32,56,73,.08)
            </p>
          </div>
          <div
            className="bg-white p-8 shadow-lift"
            style={{ borderRadius: "28px" }}
          >
            <span className="eyebrow">Shadow lift</span>
            <p className="mt-3 text-lg text-ink">Radius 28px · jača senka</p>
            <p className="mt-1 text-sm text-slate-soft">
              0 18px 60px rgba(32,56,73,.16)
            </p>
          </div>
        </div>
      </Section>

      {/* shadcn komponente */}
      <Section eyebrow="Komponente" title="shadcn/ui u brend stilu">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Tvoj niz</CardTitle>
              <CardDescription>Uzastopni dani protokola</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-semibold text-ink">14</span>
                <span className="text-slate-mid">dana zaredom</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>VIP</Badge>
                <Badge variant="secondary">7 dana</Badge>
                <Badge variant="outline">15 dana</Badge>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="lime" className="w-full rounded-full">
                Loguj večernju dozu
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Podsetnik o dozi</CardTitle>
              <CardDescription>Podesi vreme jutarnje doze</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-slate-mid">Vreme doze</label>
                <Input type="time" defaultValue="08:00" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-mid">Email</label>
                <Input type="email" placeholder="ime@primer.rs" />
              </div>
            </CardContent>
            <CardFooter className="gap-3">
              <Button variant="dark" className="rounded-full">
                Sačuvaj
              </Button>
              <Button variant="ghost" className="rounded-full">
                Otkaži
              </Button>
            </CardFooter>
          </Card>
        </div>
      </Section>
    </main>
  );
}
