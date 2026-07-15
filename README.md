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

Rute: javne (`/`, `/sign-in`, `/sign-up`, `/style-guide`, `/api/webhooks/*`); zaštićene login-om (`/dashboard`); zaštićene rolom admin (`/admin`, `/api/admin/*`).

---

## Skripte

| Komanda | Opis |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Pokreni production build |
| `npm run lint` | ESLint |
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

## Roadmap

### Faza 0 — Postavka
- [x] Next.js + TypeScript + Tailwind + brend tokeni + Hanken Grotesk
- [x] shadcn/ui u ZenFlow stilu + style guide strana
- [x] **Neon Postgres + Drizzle (šeme iz PRD §07)**
- [x] **Clerk (login/signup, role u publicMetadata, admin middleware gating, user→DB webhook)**
- [ ] Vercel deploy + Resend + Serwist PWA shell

### Faza 1 — MVP
WooCommerce sync + `access_status` · onboarding + Focus Score kviz · protokol tracker (niz, heatmap, kriva fokusa) · zalihe + predviđanje isteka · Web Push + Resend notifikacije (Vercel Cron) · Pomodoro + dnevni zadaci · dashboard + bedževi · admin panel · PWA poliranje.

### Faza 2
Wellness alati (disanje, meditacije, mood, journaling) · edukacija · napredni 30-dnevni uvidi · Stripe pretplata · ambijentalni zvuci i fokus mod.

---

## Struktura projekta

```
app/                  # Next.js App Router (strane, layout, globals)
  (auth)/             # Branded Clerk sign-in / sign-up rute
  admin/              # Admin panel (gejtovan rolom)
  dashboard/          # Korisnički dashboard (zahteva login)
  api/webhooks/clerk/ # Clerk → DB sync (user.created/updated/deleted)
  style-guide/        # Prikaz design sistema
components/ui/        # shadcn/ui komponente
lib/
  db/                 # Drizzle schema + klijent
  auth.ts             # getCurrentProfile / isAdmin / requireAdmin
  utils.ts            # cn() helper
middleware.ts         # Clerk auth + admin role gating
types/globals.d.ts    # CustomJwtSessionClaims (role u session token-u)
drizzle/              # Versioned SQL migracije + meta
CLAUDE.md             # Brand kontekst + radne konvencije
docs/                 # PRD, plan implementacije, finalni plan Faze 1
```

---

## Napomene

- **Disklejmer:** ZenFlow je dnevni protokol za mentalne performanse i nije namenjen dijagnostikovanju, lečenju ili prevenciji bolesti. Praćenje fokusa i raspoloženja je lično samoposmatranje, ne medicinska procena.
- **Privatnost (GDPR/ZZPL):** minimalno prikupljanje; mood/fokus podaci su osetljivi i zahtevaju eksplicitan pristanak.
- `.env.local` se **ne commituje** (u `.gitignore`); `.env.example` je šablon koji se commituje.

---

*NuroLab · ZenFlow App — interni README. Pun PRD: [`docs/zenflow-prd.md`](./docs/zenflow-prd.md).*
