# ZenFlow App — NuroLab Companion PWA

> Companion aplikacija za **ZenFlow™** protokol — dnevni habit tracker, alati za fokus i sistem koji čuva niz i podstiče ponovnu kupovinu.
>
> _Mentalne performanse za ljude koji ne mogu da priušte sebi loš dan._ — [nurolab.rs](https://nurolab.rs)

Hostuje se na **app.nurolab.rs**. Standalone Next.js aplikacija koju dobijaju ZenFlow kupci. Glavni sajt (`nurolab.rs`) je odvojen WordPress/WooCommerce projekat.

---

## Zašto postoji

ZenFlow nije „pre i posle" proizvod — efekat se **gradi iz dana u dan i nestaje kad se protokol prekine**. Zato aplikacija nije dodatak nego **retencioni motor**: svaka funkcionalnost služi jednom od tri cilja.

1. **Doslednost protokola** — da korisnik svaki dan popije obe doze (streak mehanika).
2. **Doživljaj vrednosti** — da vidi napredak i oseti da app vredi (kriva fokusa, bedževi).
3. **Ponovna kupovina** — da na vreme dokupi refill i ne prekine niz (supply alerti + CTA).

---

## Tech stack

| Sloj | Izbor |
|---|---|
| Framework | Next.js (App Router) + TypeScript + React 19 |
| Stilizovanje | Tailwind CSS v4 (brend tokeni u configu) |
| UI | shadcn/ui (Radix) |
| Baza | **Neon Postgres** |
| ORM | **Drizzle** |
| Auth + role | Clerk |
| PWA | Serwist |
| Grafike | Recharts |
| Email | Resend |
| Push | Web Push (VAPID) + Vercel Cron |
| Hosting | Vercel |
| Plaćanje (Faza 2) | Stripe (zahteva US entitet) |

> **Ključne odluke:** Supabase je odbačen u korist Neon + Clerk (kad je Clerk izabran za auth, glavna prednost Supabase-a je nestala; Neon izbegava 7-dnevnu inactivity pauzu). Detalji u [`CLAUDE.md`](./CLAUDE.md).

---

## Model pristupa

Dve role: **Admin** (NuroLab tim) i **User** (krajnji korisnik). Pristup se verifikuje preko WooCommerce porudžbine.

| `access_status` | Uslov | Pristup |
|---|---|---|
| **VIP** | Porudžbina u poslednjih 60 dana | Pun pristup, besplatno |
| **Inactive** | Nema porudžbine 60+ dana | Ograničen; poziv na dokup |
| **Subscriber** `F2` | Plaća pretplatu (Stripe) | Pun pristup bez kupovine |

Registracija je dozvoljena samo ako mejl postoji među WooCommerce porudžbinama. `access_status` se računa iz datuma poslednje porudžbine i osvežava pri svakom sync-u.

---

## Početak rada

### Preduslovi

- Node.js 20+ (testirano na 24)
- npm
- Neon Postgres baza ([neon.tech](https://neon.tech) — free tier je dovoljan za MVP)

### Setup

```bash
# 1. Instaliraj zavisnosti
npm install

# 2. Napravi .env.local iz šablona i popuni vrednosti
cp .env.example .env.local
```

`.env.local` (vidi [`.env.example`](./.env.example) za pun spisak):

```bash
# Neon pooled connection string (Neon Console → Connection Details)
DATABASE_URL="postgresql://<user>:<password>@<host>.neon.tech/<db>?sslmode=require"

# Clerk (Clerk Dashboard → API Keys)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
CLERK_WEBHOOK_SIGNING_SECRET="whsec_..."   # Clerk Dashboard → Webhooks
```

```bash
# 3. Primeni migracije na bazu
npm run db:migrate

# 4. Pokreni dev server
npm run dev
```

App radi na [http://localhost:3000](http://localhost:3000). Style guide / design sistem je na [`/style-guide`](http://localhost:3000/style-guide).

### Clerk auth — dodatna podešavanja

Pored env varijabli, u **Clerk Dashboard**-u uradi:

1. **Sessions → Customize session token** → dodaj claim da `role` stigne u session:
   ```json
   { "metadata": "{{user.public_metadata}}" }
   ```
   Middleware ([`middleware.ts`](./middleware.ts)) čita `sessionClaims.metadata.role` za gating `/admin` ruta.
2. **Webhooks** → napravi endpoint ka `https://<tvoj-domen>/api/webhooks/clerk`, subscribe na `user.created`, `user.updated`, `user.deleted`. Signing secret ide u `CLERK_WEBHOOK_SIGNING_SECRET`.
   - Lokalni test: Clerk Dashboard "Send test event" ili `ngrok` tunel ka `localhost:3000`.
3. **Bootstrap prvog admina:** Users → izaberi korisnika → **Metadata → Public** → postavi:
   ```json
   { "role": "admin" }
   ```
   Promena važi nakon sledećeg refresha session tokena (re-login). Ostali korisnici default-no dobijaju `role: "user"` preko webhook-a.

Rute: javne (`/`, `/sign-in`, `/sign-up`, `/style-guide`, `/api/webhooks/*`, `/manifest.webmanifest`, `/~offline`); zaštićene login-om (`/dashboard`); zaštićene rolom admin (`/admin`, `/api/admin/*`).

---

## Env varijable (Vercel launch lista)

Svih 21 varijabli koje kod čita. **Obavezno** = bez nje feature pada ili se tiho gasi.

| Varijabla | Obavezno | Bez nje | Odakle |
|---|---|---|---|
| `DATABASE_URL` | ✅ | app ne radi | Neon Console → Connection Details (pooled, `?sslmode=require`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | nema login | Clerk → API Keys (`pk_live_` u produkciji) |
| `CLERK_SECRET_KEY` | ✅ | nema login | Clerk → API Keys (`sk_live_`) |
| `CLERK_WEBHOOK_SIGNING_SECRET` | ✅ | profili se ne kreiraju u DB | Clerk → Webhooks → Signing Secret |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | ✅ | Clerk vodi na svoj hosted UI | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | ✅ | isto | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | ✅ | redirect posle logina promašuje | `/dashboard` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | ✅ | isto | `/dashboard` |
| `RESEND_API_KEY` | ✅ | nema welcome ni low-stock mejla | resend.com → API Keys |
| `EMAIL_FROM` | ⚠️ | fallback `onboarding@resend.dev` (šalje samo vlasniku naloga) | posle verifikacije domena: `NuroLab <noreply@nurolab.rs>` |
| `CRON_SECRET` | ✅ | **sve cron rute vraćaju 401** | `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | ✅ | linkovi u mejlovima gađaju `localhost` | `https://app.nurolab.rs` |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | ⚠️ | fallback `podrska@nurolab.rs` | — |
| `NEXT_PUBLIC_SHOP_REFILL_URL` | ✅ | **refill CTA se tiho ne prikazuje** na `/zalihe`, `/dashboard`, `/podesavanja` | link ka ZenFlow proizvodu |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✅ | nema push pretplate | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | ✅ | push slanje puca (logovano kao `failed`) | isto |
| `VAPID_SUBJECT` | ⚠️ | fallback `mailto:podrska@nurolab.rs` | `mailto:` ili `https://` |
| `WOO_WEBHOOK_SECRET` | ✅ | Woo webhook odbijen → nema VIP verifikacije | isti string i u WooCommerce webhook "Secret" polju |
| `WOO_STORE_URL` | ✅ | backfill ne radi | `https://nurolab.rs` (bez završne `/`) |
| `WOO_CONSUMER_KEY` | ✅ | backfill ne radi | WooCommerce → Settings → Advanced → REST API |
| `WOO_CONSUMER_SECRET` | ✅ | backfill ne radi | isto |

Uz env varijable, za pun launch treba i **eksterni scheduler** za `/api/cron/notifications` — vidi [`docs/cron-setup.md`](./docs/cron-setup.md). Posle svake izmene env varijabli → **Redeploy**.

---

## Skripte

| Komanda | Opis |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Pokreni production build |
| `npm run lint` | ESLint |
| `npx tsx scripts/qa-dates.mts` | QA harness: timezone/DST i streak logika pod zamrznutim satom (47 provera) |
| `npm run db:generate` | Generiši SQL migraciju iz promena u `lib/db/schema.ts` |
| `npm run db:migrate` | Primeni versioned migracije na Neon |
| `npm run db:push` | Gurni šemu direktno (samo za brzi prototip) |
| `npm run db:studio` | Vizuelni pregled baze u browseru |

---

## Baza i ORM

Drizzle šeme su u [`lib/db/schema.ts`](./lib/db/schema.ts), Drizzle klijent (neon-http) u [`lib/db/index.ts`](./lib/db/index.ts). Migracije se verzionišu u [`drizzle/`](./drizzle/) i commituju.

```ts
import { db, profiles } from '@/lib/db'

const rows = await db.select().from(profiles)

// relational query
const user = await db.query.profiles.findFirst({
  with: { supply: true, protocolLogs: true },
})
```

### Tabele (Faza 1)

| Tabela | Uloga |
|---|---|
| `profiles` | Korisnički nalog (`id` = Clerk user id), role, `access_status`, podešavanja doza |
| `orders` | WooCommerce porudžbine (`full` / `refill`), osnova za `access_status` |
| `protocol_logs` | Dnevni check-in po dozi (jutro/veče) — osnova streak-a |
| `supply` | Preostale kapsule + predviđeni datum isteka |
| `focus_sessions` | Pomodoro deep-work blokovi |
| `daily_tasks` | „3 najvažnija zadatka danas" |
| `badges` | Osvojeni bedževi (7 / 15 / 30 dana) |
| `push_subscriptions` | Web Push pretplate (endpoint, p256dh, auth) |
| `notifications_log` | Istorija poslatih notifikacija (push/email) |
| `focus_quiz_results` | Focus Score kviz rezultati |

> Faza 2 dodaci (još nisu u šemi): `mood_checkins`, `journal_entries`, `subscriptions`, `content_items`.

---

## Design sistem

Princip: clean i premium. Paper pozadina, bele kartice sa mekim senkama, lime kao jedini jak akcenat, dosta vazduha, zaobljeni radijusi. Brend tokeni žive u Tailwind configu — **ne hardkoduj boje po komponentama**.

| Token | Vrednost | Uloga |
|---|---|---|
| `--paper` | `#ECF0F3` | pozadina |
| `--ink` | `#203849` | tekst / tamna dugmad |
| `--lime` | `#DEFE9C` | akcenat / CTA |
| `--mint` | `#D3FBD8` | sekundarni akcenat |

- **Font:** Hanken Grotesk (300–700)
- **Radijusi:** 20px / 28px · **Senke:** soft `0 6px 30px rgba(32,56,73,.08)`, lift `0 18px 60px rgba(32,56,73,.16)`
- **Dugmad (pill):** `btn-dark` ink/paper · `btn-lime` lime/ink · `btn-ghost` border

Pun spisak tokena je u PRD-u (§09) i na `/style-guide` strani.

---

## Šta app radi (Faza 1 — zatvorena)

Korisnik se registruje preko Clerk-a, sistem mu proverom WooCommerce porudžbine dodeli **VIP** status (porudžbina u poslednjih 60 dana), prođe onboarding i od tog trenutka:

- **Protokol** (`/protokol`) — dva tap check-ina dnevno (jutarnja / večernja doza), streak sa flame brojačem, 7-dnevni strip, naknadni check-in do 7 dana unazad. Check-in troši 2 kapsule, undo ih vraća.
- **Zalihe** (`/zalihe`) — preostale kapsule, procena datuma isteka, ručna korekcija, refill CTA. Nova Woo porudžbina automatski top-upuje zalihe (tačno jednom — replay webhook-a ne duplira).
- **Fokus** (`/fokus`) — Pomodoro 25/5 i 50/10 sa timestamp-based odbrojavanjem (preživljava throttling taba i refresh), do 3 dnevna zadatka.
- **Bedževi** (`/bedzevi`) — 9 bedževa; dodela na check-in / fokus sesiju / onboarding, sa toast + confetti.
- **Početna** (`/dashboard`) — agregat svega + Recharts grafikon doslednosti za 14 dana, inline check-in.
- **Notifikacije** — Web Push (podsetnici za doze po individualnom vremenu, streak-at-risk, low stock) + Resend mejlovi (welcome, low stock). Dedup po beogradskom danu, ništa ne ide `inactive` korisnicima.
- **Podešavanja** (`/podesavanja`) — ime, vremena doza, push toggle, status naloga sa „VIP do <datum>".
- **Admin** (`/admin`) — metrike, lista korisnika sa streak-ovima, access override, porudžbine, backfill.
- **PWA** — instalabilna, offline fallback ekran, iOS uputstvo za „Dodaj na početni ekran".

---

## Roadmap

### Faza 0 — Postavka ✅
- [x] Next.js + TypeScript + Tailwind + brend tokeni + Hanken Grotesk
- [x] shadcn/ui u ZenFlow stilu + style guide strana
- [x] **Neon Postgres + Drizzle (šeme iz PRD §07)**
- [x] **Clerk (login/signup, role u publicMetadata, admin middleware gating, user→DB webhook)**
- [x] Vercel deploy + Resend + Serwist PWA shell

### Faza 1 — MVP ✅
- [x] 1.1–1.4 WooCommerce sync + `access_status` · gejt pristupa · onboarding + Focus Score kviz · Resend + `notifications_log`
- [x] 1.5 `lib/dates.ts` (beogradski dan kao jedini izvor „danas") + fixes
- [x] 1.6 Protokol tracker + streak (sa pauzom za `inactive` periode)
- [x] 1.7 Zalihe + refill top-up iz Woo porudžbine
- [x] 1.8 Web Push infrastruktura (VAPID, SW handleri, subscribe perzistencija)
- [x] 1.9 Notification cron dispatcher (eksterni scheduler, 15 min)
- [x] 1.10 Fokus — Pomodoro + 3 dnevna zadatka
- [x] 1.11 Bedževi — katalog, award engine, stranica
- [x] 1.12 Dashboard (Početna)
- [x] 1.13 Obogaćen onboarding (story intro, kviz po ekranu, Focus Score gauge, celebracija)
- [x] 1.14 Podešavanja UI (uklj. karticu Nalog)
- [x] 1.15 Admin panel
- [x] 1.16 QA, hardening, launch priprema

### Faza 2
Wellness alati (disanje, meditacije, mood, journaling) · edukacija · napredni 30-dnevni uvidi · Stripe pretplata · ambijentalni zvuci i fokus mod.

**Otvoreno iz Faze 1 (nije blocker za launch):** streak „pauza" se oslanja na pokrivenost porudžbinom (60 dana), a pakovanje traje 15 dana — vidi „Poznata ograničenja".

---

## Struktura projekta

```
app/
  (app)/              # Ulogovani deo: dashboard, protokol, zalihe, fokus, bedzevi, podesavanja
  (admin)/admin/      # Admin panel (gejtovan rolom): metrike, korisnici, porudžbine
  (auth)/             # Branded Clerk sign-in / sign-up rute
  onboarding/         # Wizard: intro slajdovi → protokol → doze → kviz → rezultat → notifikacije
    steps/
  api/
    cron/             # low-stock, refresh-access (Vercel) + notifications (eksterni scheduler)
    webhooks/         # clerk (user.*) i woocommerce (order.*)
    admin/            # push test, woocommerce backfill
  ~offline/           # Offline fallback (precache-ovan preko manifestTransforms u next.config.ts)
  sw.ts               # Serwist SW: precache, offline fallback, push + notificationclick
  manifest.ts         # PWA manifest
components/
  ui/                 # shadcn/ui komponente
  protocol/ supply/ focus/ badges/ dashboard/ settings/ push/ admin/ app-shell/
lib/
  db/                 # Drizzle schema + klijent
  dates.ts            # Beogradski dan — JEDINI izvor "danas" (bez toISOString().slice)
  protocol/           # streak.ts (čista logika), queries.ts, dosing.ts
  push/               # send.ts, client.ts, dedup.ts, types.ts
  badges/             # catalog.ts, award.ts
  access/status.ts    # VIP prozor (60 dana) + bulk maintenance
  woocommerce/        # sync.ts, products.ts (SKU mapa), env.ts
  actions/            # createAction — auth + zod + error handling za sve server akcije
  validations/        # zod šeme
  auth.ts             # getCurrentProfile / isAdmin / requireAdmin
middleware.ts         # Clerk auth + admin role gating
scripts/qa-dates.mts  # QA harness: timezone/DST + streak pod zamrznutim satom
drizzle/              # Versioned SQL migracije + meta
docs/                 # PRD, planovi, cron-setup.md
CLAUDE.md             # Brand kontekst + radne konvencije
```

---

## Poznata ograničenja

Zabeleženo pri zatvaranju Faze 1 (nije blocker za launch, ali treba znati):

- **Streak „pauza" retko opali.** Niz se zamrzava samo dok korisnik nije „pokriven" porudžbinom, a pokrivenost traje **60 dana** od porudžbine dok jedno pakovanje (60 kapsula, 4/dan) traje **15 dana**. Dani 16–60 su „pokriven + nekompletan" → niz se resetuje mnogo pre nego što `frozen` zona počne. Pauza pomogne samo ako je korisnik čekirao poslednji pokriveni dan pre rupe i prvi dan nove porudžbine. Popravka bi tražila da se zamrzavanje veže za **iscrpljene zalihe**, a ne za porudžbinu — promena semantike, odložena za odluku.
- **Otkazana / refundirana porudžbina ne vraća kapsule.** `cancelled` i `refunded` padaju u `skipped: status`, red u `orders` ostaje sa starim statusom, a top-up-ovane kapsule ostaju korisniku.
- **Ručno postavljen `vip` bez porudžbine** noćni cron (`maintainAccessStatuses`) vraća na `inactive`. Dokumentovano u admin dijalogu; bez izmene šeme u MVP-u.
- **iOS push traži instaliran PWA.** Van instalirane aplikacije `Notification` ne postoji; `components/push/ios-install-hint.tsx` prikazuje uputstvo za „Dodaj na početni ekran".
- **Javni VAPID ključ se ugrađuje u bundle na build-u.** Promena `NEXT_PUBLIC_VAPID_PUBLIC_KEY` bez redeploy-a ostavlja stari ključ u klijentu → sve pretplate dobijaju 403. Kad push ne stiže: `/admin` → „Dijagnostika push-a", pa [`docs/push-troubleshooting.md`](./docs/push-troubleshooting.md).

---

## Napomene

- **Disklejmer:** ZenFlow je dnevni protokol za mentalne performanse i nije namenjen dijagnostikovanju, lečenju ili prevenciji bolesti. Praćenje fokusa i raspoloženja je lično samoposmatranje, ne medicinska procena.
- **Privatnost (GDPR/ZZPL):** minimalno prikupljanje; mood/fokus podaci su osetljivi i zahtevaju eksplicitan pristanak.
- `.env.local` se **ne commituje** (u `.gitignore`); `.env.example` je šablon koji se commituje. Launch lista za Vercel je [gore](#env-varijable-vercel-launch-lista).
- **Build ide kroz webpack** (`next build --webpack`), ne Turbopack — Serwist koristi injector mod.

---

*NuroLab · ZenFlow App — interni README. Pun PRD: [`docs/zenflow-prd.md`](./docs/zenflow-prd.md).*
