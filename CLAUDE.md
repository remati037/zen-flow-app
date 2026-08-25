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
- **Ručni override pristupa (`profiles.access_override`):** admin sme da nametne `vip`/`inactive`
  nezavisno od porudžbina. Override je TRAJAN — poštuju ga i `resolveAccessStatus` i
  `maintainAccessStatuses`, pa ga ne gasi ni korisnikov refresh ni noćni cron; skida se samo
  eksplicitno („Vrati automatiku"). Admin rola je i dalje iznad override-a.
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
- Šema je kompletna za Fazu 1. Odobrene naknadne migracije: `0001` (indeksi), `0002`
  (`cron_runs` heartbeat, Faza 2 blok 1), `0003` (`notifications_log.dedup_day` +
  `notifications_log_dedup_uq`, `push_subscriptions.last_seen_at` + indeks po korisniku;
  Faza 2 blok 2) i `0004` (`profiles.access_override` + `_at` + `_by` + CHECK,
  `profiles.email_alerts`, `supply.low_stock_alerts_sent`; Faza 2 blok 3) — nema novih bez
  eksplicitne potrebe. `orders_email_lower_date_idx` je funkcionalni
  (`lower(email)`, `order_date DESC`) jer svaki upit za pristup poredi mejl case-insensitive;
  `protocol_logs_date_taken_idx` je parcijalni (`WHERE status = 'taken'`).
- Boje samo kroz Tailwind brand tokene (`@theme` u `app/globals.css`). Hardkodovani hex je dozvoljen **samo** u: `app/manifest.ts`, Clerk `appearance` u `app/layout.tsx`, `app/style-guide/page.tsx`, `lib/email/templates/*` (email klijenti nemaju Tailwind), `lib/confetti.ts`.
- Build ide kroz **webpack** (`next build --webpack`), ne Turbopack — Serwist injector mod.
- QA harness ima TRI sloja i sva tri moraju ostati zelena (`npm run qa` vozi sve):
  `qa-dates` (čiste funkcije: datumi/streak/prozori/Woo/access override/cap alerta/odjavni
  token, 218 provera), `qa-routes` (klasifikacija ruta, 50 provera) i **`qa-sql`**
  (69 provera — SQL koji se STVARNO izvršava nad pravim Postgres-om).
- **`qa-sql` postoji zato što prva dva sloja ne izvršavaju nijedan upit.** Dva produkciona
  otkaza su prošla kroz lint, build i obe stare provere netaknuta: `GROUP BY` sa bind
  parametrom (upit se kompajlira, Postgres ga odbija) i produkcijska baza zaostala na
  migraciji `0000`. `qa-sql` vozi PRAVE funkcije aplikacije — ne prepisane kopije, koje se
  vremenom raziđu — kroz `scripts/lib/neon-pg-adapter.mts` (zakrpa nad globalnim `fetch`-om
  koja neon-http saobraćaj vodi na `pg`) i `--conditions=react-server` (propušta `server-only`).
  **Svaka nova funkcija sa netrivijalnim SQL-om ide u sekciju 6 tog harness-a.**
- **Svaki objekat koji migracija uvodi MORA biti u `EXPECTED_SCHEMA`** (`lib/db/expected-schema.ts`).
  `qa-sql` parsira migracione fajlove i pada ako nešto nedostaje — prva verzija spiska je
  propuštala šest indeksa, pa ih `/api/cron/db-check` ne bi prijavio ni da fale na produkciji.
- **Testovi koji pišu idu u `BEGIN`/`ROLLBACK`** nad `pg` konekcijom adaptera (obuhvata i upite
  koje drizzle pošalje kroz neon-http), a namerni prekršaji ograničenja u `SAVEPOINT` — inače
  Postgres odbija sve do kraja transakcije i jedan očekivan pad obori sve provere posle njega. Oba moraju ostati zelena. `qa-routes` čita `app/api` sa DISKA i obara
  se na svakoj ruti koja nije ni javna, ni admin, ni u `SESSION_ROUTES` — nova ruta ne može tiho
  da promakne.
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
  "ruta ne postoji". Tako su cron rute tiho bile mrtve. `scripts/qa-routes.mts` ovo sada forsira
  enumeracijom `app/api` sa diska.
- **Prozor podsetnika ima JEDAN izvor istine:** `WINDOW_MIN` iz `lib/push/dispatch-rules.ts`
  (default 45, env `NOTIFICATION_WINDOW_MIN`). Nikad hardkodovan `+30` — dijagnostika je tako
  prikazivala lažan prozor. Prozor je namerno TROSTRUK u odnosu na kadencu (15 min) jer GitHub
  Actions `schedule` kasni i preskače run-ove; pokrivenost je potpuna dok je stvaran razmak između
  poziva ≤ prozor. Širenje prozora je bezbedno jer dedup radi po beogradskom DANU i tipu, ne po
  prozoru — više run-ova u istom prozoru daje jedan podsetnik.
- **Svaka cron ruta upisuje heartbeat** (`recordCronRun` iz `lib/cron/heartbeat.ts` → `cron_runs`),
  BEZ OBZIRA na ishod. `notifications_log` ne može da posluži: run bez kandidata ne upiše nijedan
  red, pa se „scheduler je mrtav" ne razlikuje od „nema kandidata". Klasifikacija stanja je u
  `lib/cron/health.ts` (čist modul, bez `server-only`, da ga QA importuje); admin je vidi kao
  blocker u „Dijagnostika push-a".
- **Batch cron rute idu kroz `runChunked`** (`lib/cron/fanout.ts`, chunk 12) i imaju
  `export const maxDuration = 60` (Hobby maksimum). `Promise.allSettled` izoluje pad na jednog
  korisnika — sekvencijalna petlja bez `try/catch` je jednim `throw`-om obarala ceo batch, a bez
  `maxDuration` se batch sekao na 10 s i poslednji korisnici ostajali bez podsetnika.
  `web-push` slanje ima `timeout: 5000` (socket) da zaglavljen push servis ne pojede budžet funkcije.
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
- **Dedup notifikacija je REZERVACIJA, ne provera.** Svako vremenski uslovljeno slanje
  prosleđuje `dedup: { day: belgradeToday() }` u `sendPushToUser` / `sendEmail`; oni pre
  slanja upišu `pending` red u `notifications_log` (`claimNotification`), a jedinstveni
  parcijalni indeks `notifications_log_dedup_uq` `(user_id, type, channel, dedup_day)
  WHERE dedup_day IS NOT NULL` presuđuje ko je prvi. Bulk `filterNotifiedSince` ostaje
  SAMO kao jeftin pred-filter — sam po sebi je check-then-act i dva preklapajuća run-a
  ga oba prođu. `on conflict` mora da ponovi predikat indeksa. Neuspelo slanje oslobađa
  slot (`settleNotification(id, false)` → `dedup_day = null`); prekinut proces ostavlja
  `pending` red koji slot ZADRŽAVA — svesna razmena (propušten podsetnik < duplikat),
  vidljiva u dijagnostici i otpustiva kroz `/api/admin/push/reset-dedup`.
- **Endpoint pretplate se NIKAD ne preuzima od drugog korisnika.** `savePushSubscription`
  i `/api/push/rotate` upsertuju sa `on conflict ("endpoint") do update ... where
  push_subscriptions.user_id = excluded.user_id` — na tuđi red izjava je no-op, `returning`
  je prazan i akcija vraća `PUSH_ENDPOINT_TAKEN_ERROR`. Scoped unique `(user_id, endpoint)`
  je ODBAČEN: dozvolio bi da isti uređaj stoji pod dva naloga, pa bi tuđi podsetnici i
  dalje stizali na taj ekran. Deljen uređaj se rešava na klijentu — `lib/push/client.ts`
  na tu grešku odjavi pretplatu i napravi svežu (push servis izdaje nov endpoint).
- **`/api/push/rotate` je javna i autentikuje se POSEDOVANJEM starog endpoint-a.** Zove je
  service worker iz `pushsubscriptionchange`, često bez ijednog otvorenog prozora; Clerk
  `__session` je kratkoživeći JWT koji osvežava klijent, pa bi `auth.protect()` vratio 404
  baš kad je rotacija najpotrebnija. `user_id` se izvodi IZ POSTOJEĆEG REDA, nikad iz tela
  zahteva, a ceo posao (upsert nove + brisanje stare) je JEDNA SQL izjava sa CTE lancem.
  Drugi sloj je `syncPushSubscription` (re-upsert na app load) — `pushsubscriptionchange`
  nije garantovan i ume da stigne bez `oldSubscription`. Bumpuj `SW_VERSION` uz svaku
  izmenu `app/sw.ts`.
- **Pretplata mora nositi TRENUTNI VAPID ključ.** `subscribeToPush` poredi
  `existing.options.applicationServerKey` sa aktuelnim i na nepoklapanje radi
  `unsubscribe()` + svež `subscribe()`. Reciklirana pretplata starog ključa daje 403 na
  SVAKO slanje zauvek, uz UI koji tvrdi da je push uključen. `null` (browser ne izlaže
  `options`) znači „ne može da se utvrdi" — tada se NE dira ništa.
- **Idempotencija Clerk webhook-a ne sme da visi o `returning()`.** `onConflictDoNothing`
  na retry-ju vraća prazan niz, pa je uslov `if (inserted.length > 0)` preskakao i
  verifikaciju pristupa i welcome mejl. Verifikacija sada ide na OBE putanje; welcome mejl
  je gejtovan sa `hasEverNotified(id, 'welcome', 'email')` (jednom u životu naloga) plus
  dnevnom rezervacijom (dva istovremena retry-ja).
- **Access override je ZASEBNA kolona, nikad `access_status`.** `access_status` je IZVEDENA
  vrednost koju `refreshAccessStatusForProfile` prepisuje na svaki ulaz u app i na svaku server
  akciju — dok je override pisao u nju, prvi sledeći page load korisnika ga je poništavao, u OBA
  smera (blokiran nalog je posle refresh-a opet bio VIP). Odluka živi u `lib/access/resolve.ts`
  (čist modul, bez `server-only`, da ga QA importuje) sa fiksnim prioritetom:
  **rola → override → subscriber → prozor porudžbine**. `maintainAccessStatuses` mora da preskoči
  redove sa override-om na OBE grane (i gašenje i vraćanje).
- **Alert mejlovi imaju tri nezavisna ograničenja, i svako radi drugi posao.** Dedup po kanalu
  (3 dana) drži UČESTALOST, dnevna rezervacija štiti od preklapajućih run-ova, a
  `supply.low_stock_alerts_sent` + `LOW_STOCK_MAX_ALERTS_PER_EPISODE` (3) drže UKUPAN broj po
  epizodi. Brojač se resetuje kad zalihe pređu `LOW_STOCK_THRESHOLD` — reset je vezan za STANJE,
  ne za događaj „dopuna", pa mora da stoji u SVAKOM putu upisa u `supply`
  (`updateSupply`, Woo `topUpSupplyForEmail`, CTE u `logDose`).
- **`profiles.email_alerts` gasi SAMO alert mejlove** (`EMAIL_ALERT_TYPES` u `lib/email/send.ts`),
  nikad transakcione (`welcome`) i nikad push. Provera stoji na DVA mesta: cron pred-filtrira
  (ušteda upita + tačan brojač), a `sendEmail` je garancija — nova ruta ne može da procuri kroz
  opt-out zato što je neko zaboravio filter. `List-Unsubscribe` + `List-Unsubscribe-Post`
  (RFC 8058 one-click) idu SAMO na tipove koje odjava stvarno gasi; deklarisati odjavu na mejlu
  koji se njome ne gasi je laž prema mailbox provajderu.
- **`/api/email/unsubscribe` je javna i autentikuje se HMAC tokenom.** Zovu je mejl klijent i
  Gmail-ov one-click POST — nijedan nema Clerk sesiju, a `auth.protect()` bi za ne-HTML zahtev
  vratio 404. Token se potpisuje `EMAIL_UNSUBSCRIBE_SECRET`-om, uz fallback na `CRON_SECRET`
  (ključ nikad ne ide u URL, samo digest). Bez isteka — dugme koje ne radi se zamenjuje dugmetom
  „Spam".
- **Logovanje ide kroz `lib/observability/log.ts`, ne kroz `console.error`.** Jedan JSON red po
  događaju, sa stabilnim imenom iz `EVENTS` — slobodan string bi značio da se isti otkaz zove
  dvojako, pa nijedan filter ne hvata oba. NIKAD ne logovati pun push endpoint (tajni token) ni
  mejl adresu; `userId` je dovoljan za korelaciju. Klijentski kod (`lib/push/client.ts`, `app/sw.ts`)
  ostaje na `console` — to je browser konzola, ne server log.
- **Isporučenost se meri agregatom `notifications_log` po BEOGRADSKOM danu** (`lib/admin/delivery.ts`,
  prikaz u `/admin`). Grupisanje po UTC danu bi večernje podsetnike posle ponoći bacalo u pogrešnu
  kolonu. Dani bez ijednog reda se popunjavaju nulama — nestao dan izgleda kao da ga nije bilo,
  nula izgleda kao otkaz (i to i jeste ako je dan imao kandidate).
- **`GROUP BY` nad izrazom NIKAD ne sme da nosi bind parametar.** Drizzle svakoj upotrebi
  `${VAR}` dodeli SVOJ placeholder, pa isti izraz u `select` listi ($1) i u `group by` ($4)
  Postgres ne prepoznaje kao isti i odbija upit („column … must appear in the GROUP BY clause").
  Konstante zone/formata idu kroz `sql.raw` (vidi `tz` u `lib/admin/delivery.ts`) — bezbedno samo
  zato što su naše konstante, nikad korisnički unos. QA harness ovo NE hvata: ne izvršava SQL.
- **Nijedan modul ne sme da baca na IMPORTU zbog nedostajuće env varijable.** `next build` u fazi
  „Collecting page data" importuje svaki route modul da pročita njegovu konfiguraciju, pa eager
  provera tajne obara BUILD porukom koja optužuje rutu („Failed to collect configuration for
  /api/…"), a ne konfiguraciju. Tajne se čitaju LENJO, pri prvoj upotrebi: `lib/db/index.ts`
  (Proxy nad drizzle instancom — lenj *neon* klijent ne bi radio, jer `drizzle()` na konstrukciji
  čita `client.query`), `lib/email/client.ts` (Resend), `lib/push/send.ts` (VAPID). CI to čuva
  tako što build vozi **bez** `DATABASE_URL`-a; placeholder vrednost je taj otkaz ranije maskirala.
- **Security header-i su u `headers()` u `next.config.ts`** (CSP, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`) uz `poweredByHeader: false`. Clerk FAPI host
  se IZVODI iz `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (base64 payload), pa dev i produkcija rade bez
  dodatne env varijable. **Svaki novi eksterni domen (skripta, XHR, slika, iframe, font) mora se
  dodati u odgovarajuću CSP direktivu** — inače tiho puca tek u produkciji. `script-src` ima
  `'unsafe-inline'` jer Next App Router inline-uje RSC bootstrap; nonce bi tražio middleware i
  gurnuo sve stranice u dynamic rendering.

---

## Faza 2 — scope

**Blok 1 ✅ ZATVOREN — hardening notification dispatchera** (L-M5, D-L2, P-M3):
per-user izolacija + chunked `Promise.allSettled`, socket timeout, `maxDuration`, razložen odgovor
rute po tipu (poslato/neuspelo/preskočeno), prozor 45 min kao jedan izvor istine, i heartbeat
(`cron_runs`) sa alertom u admin dijagnostici kad dispatcher ćuti. Detalji: `docs/cron-setup.md`.

Ostatak:

**Blok 2 ✅ ZATVOREN — pouzdanost push pretplata** (P-M1, S-M4, S-M6, S-L1, S-L2):
`pushsubscriptionchange` handler u SW + `/api/push/rotate` + re-upsert na app load,
atomaran dedup kroz rezervaciju u `notifications_log`, zabrana otmice tuđeg endpoint-a,
detekcija zastarelog VAPID ključa i idempotentan Clerk webhook. Jedna migracija: `0003`.

**Blok 3 ✅ ZATVOREN — pristup, email higijena i opservabilnost** (L-M2, V10, O-M1, O-M2):
trajan `access_override` (+ ispravljen admin copy koji je lagao da ga gasi cron), opt-out za
alert mejlove sa `List-Unsubscribe` one-click rutom, cap od 3 alerta po epizodi niskih zaliha,
strukturni JSON logovi umesto `console.error`, agregat isporučenosti u adminu + dnevni cron
izveštaj, i CI na PR-u (`.github/workflows/ci.yml`). Jedna migracija: `0004`.
**Sentry NIJE uzet** — vidi „Ograničenja i ključne odluke".

Ostatak:

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
- **Sentry je odložen u korist strukturnih JSON logova.** Free tier (5k grešaka/mesec, 1 korisnik,
  30 dana retencije) bi bio dovoljan, ali nosi: novi eksterni servis u lancu, `connect-src` unos u
  CSP-u (`next.config.ts`), ~90 kB u klijentskom bundle-u i tunel rutu zbog ad-blockera. Za jedan
  proizvod sa jednim adminom `lib/observability/log.ts` + `/api/cron/daily-report` daju istu
  odgovornost — grep-abilan trag i dnevni presek — bez ijedne od tih cena. Ako obim naraste,
  prelazak je jeftin: JSON redovi već imaju stabilna imena događaja i idu na stdout, pa je dovoljno
  zakačiti log drain.
- **FunnelKit** (na WordPress strani) koristi custom post type za checkout, ne default `/checkout` URL — detekcija mora preko `WFACP_Common::get_post_type_slug()`, ne preko URL matchinga. (Relevantno ako PWA komunicira sa WP-om.)

---

## Repo konvencije

- Drži PRD i implementacioni plan u `/docs`.
- Faze prati kao Faza 0 (setup) → Faza 1 (MVP) → Faza 2.
- Kad zatvoriš fazu, ažuriraj sekcije iznad u ovom fajlu.
- Pre commita: `npm run qa` (lint + sva tri harness-a) + `npm run build` (webpack).
  `qa:sql` bez `TEST_DATABASE_URL`-a preskače DB deo lokalno, ali u CI-ju (`CI=true`) je
  obavezan — tamo ga vozi `postgres:17` service container.
  Isti niz vozi i CI na svaki PR (`.github/workflows/ci.yml`) sa placeholder env vrednostima —
  nijedna tajna nije potrebna jer CI ne kontaktira nijedan servis. Dodatno proverava da je
  `public/sw.js` stvarno generisan (Serwist ume da „uspe" bez upisanog fajla).
- Env varijable: launch lista je u README (`Env varijable (Vercel launch lista)`); scheduler u `docs/cron-setup.md`.
- Precache PWA ruta: `/~offline` se dodaje kroz `manifestTransforms` u `next.config.ts` (NE kroz `additionalPrecacheEntries` — ta opcija zamenjuje glob nad `public/` i izbacila bi ikone). Bumpuj `SW_VERSION` kad se offline stranica menja.
