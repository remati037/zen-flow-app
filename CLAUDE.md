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

## Faza 1 — MVP scope ✅ ZATVORENA

Svi koraci 1.1–1.16 su gotovi. Definicija gotovo je ispunjena: korisnik se loguje preko Clerk-a, sistem verifikuje VIP status preko WooCommerce porudžbine, prati dnevni protokol sa streak-om, dobija alerte za niske zalihe (push + email), i koristi Pomodoro timer. Admin vidi i upravlja korisnicima.

Šta je isporučeno:

- **Protocol tracker sa streak mehanikom** — `/protokol`, check-in obe doze, 7-dnevni strip, backfill do 7 dana. Streak se pauzira dok je korisnik `inactive` (vidi „Poznata ograničenja" u README).
- **Supply tracking** — `/zalihe`, check-in troši kapsule, Woo porudžbina top-upuje tačno jednom, low-stock alert na push + email.
- **Pomodoro timer + 3 dnevna zadatka** — `/fokus`, timestamp-based countdown, limit zadataka enforce-ovan server-side.
- **Dashboard sa bedževima** — `/dashboard` (agregat + Recharts doslednost 14d), `/bedzevi` (9 bedževa, award engine).
- **Web Push** — VAPID, SW `push`/`notificationclick` handleri, dispatcher na 15 min (eksterni scheduler), dedup po beogradskom danu.
- **Admin panel** — `/admin` metrike, korisnici sa streak-ovima + access override, porudžbine + backfill.
- **WooCommerce order sync** — webhook + backfill, isti `upsertOrder` za oba puta.
- **PWA** — instalabilna, offline fallback, iOS install hint.

**Ključne konvencije koje MORAŠ da poštuješ u svakom novom kodu:**

- „Danas" je **isključivo** `belgradeToday()` iz `lib/dates.ts`. Nikad `toISOString().slice(0,10)` — grep mora ostati čist.
- Sve server akcije idu kroz `createAction` iz `lib/actions/safe-action.ts` (auth + **gejt pristupa** +
  zod + hvatanje grešaka → `ActionResult`).
- **Paywall je server-side, ne samo redirect.** `createAction` po defaultu zove
  `requireActiveAccess` (`lib/access/status.ts`) i neaktivnom korisniku vraća `ActionResult`
  grešku. Redirect u `(app)/layout.tsx` štiti samo render — server akcija je zaseban POST
  endpoint i bez ovoga je bila otvorena. Gejt koristi ISTI izvor istine kao layout
  (`refreshAccessStatusForProfile` + Clerk rola), ne zastareli `profile.accessStatus`.
  Opt-out je EKSPLICITAN po akciji (`allowInactive: true`) — trenutno ga nijedna ne koristi;
  `admin: true` akcije su izuzete (rola je izvor istine, admin je uvek `vip`).
- Šema je kompletna za Fazu 1. Jedina odobrena naknadna migracija je `0001` (indeksi) —
  nema novih bez eksplicitne potrebe. `orders_email_lower_date_idx` je funkcionalni
  (`lower(email)`, `order_date DESC`) jer svaki upit za pristup poredi mejl case-insensitive;
  `protocol_logs_date_taken_idx` je parcijalni (`WHERE status = 'taken'`).
- Boje samo kroz Tailwind brand tokene (`@theme` u `app/globals.css`). Hardkodovani hex je dozvoljen **samo** u: `app/manifest.ts`, Clerk `appearance` u `app/layout.tsx`, `app/style-guide/page.tsx`, `lib/email/templates/*` (email klijenti nemaju Tailwind), `lib/confetti.ts`.
- Build ide kroz **webpack** (`next build --webpack`), ne Turbopack — Serwist injector mod.
- QA harness: `npx tsx scripts/qa-dates.mts` (datumi/streak/prozori dispatchera/Woo integritet, 156 provera) i
  `npx tsx scripts/qa-routes.mts` (klasifikacija ruta u middleware-u, 27 provera). Oba moraju ostati zelena.
- **Woo statusi imaju tri klase** (`lib/woocommerce/order-rules.ts` — čist modul, bez `server-only`,
  da ga QA može importovati): `processing`/`completed` = daju pristup, `cancelled`/`refunded`/`failed`
  = opozivaju (ažuriraju status postojećeg reda), ostalo se ignoriše. **Svaki novi upit koji iz
  `orders` izvodi PRISTUP mora da filtrira po `SYNCED_STATUSES`** — inače refund i dalje drži VIP.
  Admin prikaz namerno ne filtrira.
- **Datum Woo porudžbine ide isključivo kroz `resolveOrderDate`** (`*_gmt` polja + eksplicitni `Z`).
  Woo GMT polja nemaju oznaku zone, pa ih `new Date()` parsira kao lokalno vreme procesa.
- **Prozor pristupa ima JEDAN izvor istine:** `lib/access/window.ts` (client-safe, bez
  `server-only`). VIP gejt i coverage streak-a moraju koristiti iste helpere
  (`accessWindowEnd` / `accessWindowCutoff` / `isWithinAccessWindow`) — nikad `now - N*DAY_MS`.
  Prozor se meri u **beogradskim kalendarskim danima**; ms-aritmetika drifta na DST-u i na
  satnici porudžbine, pa su se dva prozora razilazila za ceo dan (streak je resetovao
  poslednji pokriveni dan umesto da ga zamrzne).
- **Upis koji menja dve tabele mora biti JEDNA SQL izjava** (CTE lanac + `RETURNING`) —
  neon-http nema `db.transaction()`. Obrazac je u `app/(app)/protokol/actions.ts`:
  `on conflict do update ... where <kolona> is distinct from excluded.<kolona>` (red se vraća
  samo pri stvarnoj promeni → double-tap prirodno daje deltu 0, jer Postgres uslov proverava
  nad zaključanom, najnovijom verzijom reda), `xmax = 0` za insert-vs-tranziciju, i delta nad
  tekućom vrednošću u SQL-u (`greatest(0, kolona + delta)`), nikad nad ranije pročitanom.
- **Nove `/api` rute bez Clerk sesije MORAJU u `PUBLIC_ROUTES`** (`lib/route-config.ts`). Inače ih
  `auth.protect()` presretne, a Clerk za ne-HTML zahteve vraća **404** (ne 401) — otkaz izgleda kao
  "ruta ne postoji". Tako su cron rute tiho bile mrtve.
- **Cron rute se autentikuju SAMO kroz `requireCronAuth`** (`lib/cron/auth.ts`) — nikad običnim
  `!==` nad `Bearer <secret>`. String poređenje izlazi na prvom različitom bajtu, pa razlika u
  trajanju odgovora curi prefiks tajne; helper poredi SHA-256 digeste kroz `timingSafeEqual`
  (izjednačena dužina) i fail-closed je kad `CRON_SECRET` nije postavljen.
- **Endpoint push pretplate mora proći `isAllowedPushEndpoint`** (`lib/push/endpoint.ts` — čist
  modul, bez `server-only`). Endpoint dolazi kao običan string iz klijenta, a server na njega radi
  POST (`web-push`): slobodan URL je blind SSRF. Allowlist stoji na DVA mesta — zod šema
  (`lib/validations/push.ts`) za upis i `lib/push/send.ts` pred samo slanje, jer zod ne pokriva
  redove upisane ranije. Brisanje pretplate namerno NIJE allowlist-ovano (nema odlaznog zahteva,
  a stari red inače ne bi mogao da se ukloni).
- **Svaki novi `LIKE`/`ILIKE` nad korisničkim unosom escape-uje `%`, `_` i `\`** (vidi
  `escapeLikePattern` u `lib/admin/users.ts`). Nije SQL injection — vrednost je bind parametar —
  nego injection u pattern: `%` u pretrazi vraća SVE redove. Uglaste zagrade su SQL Server
  sintaksa i u Postgres-u su obični znaci; ne escape-uju se.
- **Security header-i su u `headers()` u `next.config.ts`** (CSP, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`) uz `poweredByHeader: false`. Clerk FAPI host
  se IZVODI iz `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (base64 payload), pa dev i produkcija rade bez
  dodatne env varijable. **Svaki novi eksterni domen (skripta, XHR, slika, iframe, font) mora se
  dodati u odgovarajuću CSP direktivu** — inače tiho puca tek u produkciji. `script-src` ima
  `'unsafe-inline'` jer Next App Router inline-uje RSC bootstrap; nonce bi tražio middleware i
  gurnuo sve stranice u dynamic rendering.

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
- Pre commita: `npm run build` (webpack) + `npm run lint` + `npx tsx scripts/qa-dates.mts` + `npx tsx scripts/qa-routes.mts`.
- Env varijable: launch lista je u README (`Env varijable (Vercel launch lista)`); scheduler u `docs/cron-setup.md`.
- Precache PWA ruta: `/~offline` se dodaje kroz `manifestTransforms` u `next.config.ts` (NE kroz `additionalPrecacheEntries` — ta opcija zamenjuje glob nad `public/` i izbacila bi ikone). Bumpuj `SW_VERSION` kad se offline stranica menja.
