# CLAUDE.md — NuroLab Companion PWA (app.nurolab.rs)

> Ovaj fajl Claude Code automatski čita na početku svake sesije. Drži ga u korenu repo-a.
> Ažuriraj ga kako projekat napreduje (npr. kad zatvoriš Fazu 1).

---

## Komunikacija i način rada

- Odgovaraj na **srpskom (latinica)**, neformalno (ti-forma).
- Daj **production-ready** kod — copy/paste spreman, bez placeholder-a koji traže dodatni rad, osim ako eksplicitno ne naznačim.
- Slobodno **postavljaj kratka pitanja pre/tokom rada** ako nešto nije jasno, ali nemoj da blokiraš posao zbog sitnica — predloži razumnu pretpostavku i nastavi.
- Proaktivno **flaguj edge case-ove** (FunnelKit detekcija, email klijent ograničenja, Ćirilica/encoding problemi, itd.).
- Radimo u **fazama** (MVP prvo, pa Faza 2), sa jasnom definicijom "gotovo" po fazi.

---

## Šta gradimo

**NuroLab** je supplement/wellness brend. Flagship proizvod je **ZenFlow™**, nootropic suplement pozicioniran oko dnevnog protokola čiji se efekti **grade sa doslednošću i blede kad se prekinu**.

Ovo je core brand insight i **direktno opravdava feature logiku** aplikacije:
- streak mehanika (gradi se dnevno)
- supply alerti (da korisnik ne ostane bez zaliha → prekid protokola)
- refill CTA koji vodi ka ponovnoj kupovini (retencioni loop)

Ovo nije dekoracija — to je retencioni motor proizvoda.

**Companion PWA** je standalone Next.js aplikacija koju dobijaju ZenFlow kupci. Hostuje se na `app.nurolab.rs`. Glavni sajt (`nurolab.rs`) je odvojen WordPress/WooCommerce projekat.

---

## Tech stack (zaključan)

- **Framework:** Next.js (App Router) + TypeScript
- **Styling:** Tailwind CSS sa NuroLab brand tokenima
- **UI:** shadcn/ui
- **PWA:** Serwist
- **Grafikoni:** Recharts
- **Auth + role:** Clerk
- **Baza:** Neon Postgres
- **ORM:** Drizzle
- **Email:** Resend
- **Push notifikacije:** Web Push preko VAPID + Vercel Cron
- **Hosting:** Vercel
- **Faza 2 plaćanja:** Stripe (zahteva US entitet — vidi Ograničenja)

---

## Access model

- Dve role: **Admin** i **User**.
- **Role storage (implementirano):** `role` živi u Clerk `publicMetadata`, izložen kroz session token (Clerk Dashboard → Sessions → Customize session token: `{ "metadata": "{{user.public_metadata}}" }`). Middleware (`middleware.ts`) čita `sessionClaims.metadata.role` i gejtuje `/admin` rute bez DB poziva (Edge-safe). `role` se i dalje upisuje u `profiles` u DB radi konzistentnosti. Prvi admin se postavlja ručno u Clerk Dashboard-u.
- **Clerk → DB sync:** webhook `/api/webhooks/clerk` (`user.created/updated/deleted`) održava `profiles`. Novi korisnik dobija `role: 'user'`, `access_status: 'inactive'`, pa se odmah verifikuje preko `refreshAccessStatusForEmail` (poklapanje mejla sa `orders` → `vip` ako ima porudžbinu u 60 dana). Welcome mejl ide samo VIP kupcima.
- **Gejt pristupa (Korak 1.3):** `(app)/layout.tsx` posle `refreshAccessStatusForProfile` preusmerava `inactive` korisnike na `/nemas-pristup` (ekran sa uputstvom, CTA na shop, kontakt, odjava). Samo `vip`/`subscriber`/admin ulaze u app.
- **VIP status besplatno** za aktivne WooCommerce kupce (porudžbina u poslednjih 60 dana).
- Pristup se verifikuje preko **WooCommerce order sync-a**.
- Kupci sa VIP liste imaju **trajan besplatan pristup dok su aktivni**.
- Plaćeni subscription tier je **odložen za Fazu 2** (Stripe).

---

## Faza 1 — MVP scope

- Protocol tracker sa **streak mehanikom**
- Supply tracking sa **low-stock push/email alertima**
- **Pomodoro timer**
- Osnovni dashboard sa **bedževima**
- **Admin panel**
- **WooCommerce order sync** za verifikaciju pristupa

**Definicija gotovo (Faza 1):** korisnik se loguje preko Clerk-a, sistem verifikuje VIP status preko WooCommerce porudžbine, prati dnevni protokol sa streak-om, dobija alerte za niske zalihe, i koristi Pomodoro timer. Admin vidi i upravlja korisnicima.

---

## Faza 2 — scope

- Wellness alati: breathwork, mood check-in, journaling
- Edukativni sadržaj
- Napredni **30-day insights** izveštaj
- **Stripe** subscription billing za ne-kupce
- Eventualno automatsko unlock-ovanje VIP gate-a po datumu kad krene Phase 2 prodaja

---

## Design system (obavezno poštovati)

- Pozadina: **paper-gray**
- Primarna: **dark ink / navy**
- Akcenat: **lime green `#DEFE9C`**
- Font: **Hanken Grotesk**
- Soft box shadows, rounded card komponente
- Reveal animacije, accordion FAQ, pill dugmad

Brand tokeni idu u Tailwind config; ne hardkoduj boje po komponentama.

---

## Ograničenja i ključne odluke (NE menjati bez razloga)

- **Supabase je odbačen u korist Neon + Clerk.** Kad je Clerk izabran za auth, glavna prednost Supabase-a (auth + RLS) je nestala. Neon free tier je dovoljan za MVP i izbegava 7-dnevnu inactivity pauzu koju Supabase nameće.
- **Stripe zahteva US entitet** za srpske firme — tvrdo ograničenje za Fazu 2 monetizaciju.
- **FunnelKit** (na WordPress strani) koristi custom post type za checkout, ne default `/checkout` URL — detekcija mora preko `WFACP_Common::get_post_type_slug()`, ne preko URL matchinga. (Relevantno ako PWA komunicira sa WP-om.)

---

## Repo konvencije

- Drži PRD i implementacioni plan u `/docs`.
- Faze prati kao Faza 0 (setup) → Faza 1 (MVP) → Faza 2.
- Kad zatvoriš fazu, ažuriraj sekcije iznad u ovom fajlu.
