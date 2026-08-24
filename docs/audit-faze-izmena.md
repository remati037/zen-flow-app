# ZenFlow App — faze izmena + promptovi

> Izvor: `audit-izvestaj.html` (audit od 19. avgusta 2026, Faza 1 MVP, ceo repo).
> Ovaj fajl je operativni plan: **šta** se menja po fazama i **kojim promptom** se to pokreće.
> ID-jevi (`S-H1`, `L-M3`, `D-M1`…) su iz audit izveštaja; stari ID-jevi u zagradama (`K1`, `V5`…)
> referenciraju `docs/audit-roadmap-2026-08.md`.

## Kako se koristi

1. Radi faze po redu — redosled prati rizik i zavisnosti (novac/pristup → isporuka → UX → polish).
2. Unutar faze radi **blok po blok** (svaki blok = jedan prompt = jedna sesija / jedan commit).
3. Svaki blok se zatvara zeleno:
   ```bash
   npm run lint && npm run build && npx tsx scripts/qa-dates.mts && npx tsx scripts/qa-routes.mts
   ```
4. Kad zatvoriš fazu: štikliraj stavke ovde, ažuriraj `CLAUDE.md` i commituj.

## Pravila koja važe za SVE promptove

Svaki prompt ispod pretpostavlja ova pravila (ne moraš ih ponavljati, Claude ih čita iz `CLAUDE.md`):

- „Danas" je **isključivo** `belgradeToday()` iz `lib/dates.ts` — nikad `toISOString().slice(0,10)`.
- Sve mutacije idu kroz `createAction` iz `lib/actions/safe-action.ts`.
- Boje samo kroz Tailwind brand tokene (`@theme` u `app/globals.css`); hex samo u dozvoljenim fajlovima.
- Build je **webpack** (`npm run build`), ne Turbopack.
- Nove `/api` rute bez Clerk sesije **moraju** u `PUBLIC_ROUTES` (`lib/route-config.ts`), inače Clerk vraća 404.
- Nema novih migracija bez eksplicitne potrebe — jedina odobrena je `D-M1` (indeksi) u Fazi 1 i
  jedna spojena migracija pre Faze 2 proizvoda.
- Šema: `neon-http` **ne podržava** `db.transaction()` — atomičnost se rešava single-statement
  SQL-om (CTE / `RETURNING` / `onConflictDoUpdate`), ne transakcijama.

---

# Faza 1 — Novac, pristup i core mehanika

**Trajanje:** ~1–2 nedelje · **Kritično pre launch-a / prve prave prodaje**
**Zašto prva:** sve stavke direktno utiču na pristup, zalihe i novac.

| ID | Ozb. | Stavka | Lokacija |
|---|---|---|---|
| S-H1 (K1) | Visok | Woo datumi iz GMT polja → off-by-one dan za VIP prozor i coverage | `lib/woocommerce/sync.ts:121` |
| S-H2 (K4) | Visok | TOCTOU u `upsertOrder` → dupli top-up na retry | `lib/woocommerce/sync.ts:135-161` |
| S-H3 (K5) | Visok | Refund/cancel ne oduzima pristup | `lib/woocommerce/sync.ts:99-101` |
| S-M1 (K3) | Srednji | Supply matematika read-modify-write (double-tap −4, „kovanje" kapsula) | `app/(app)/protokol/actions.ts:31-81` |
| L-M3 (K2) | Srednji | Case-sensitive top-up po mejlu | `lib/woocommerce/sync.ts:34` |
| L-H1 (K6) | Visok | Coverage prozor ≠ VIP prozor (61 dan vs 60×86400s) | `lib/protocol/streak.ts:45`, `lib/access/status.ts:34,137` |
| S-M2 (K7) | Srednji | Paywall je samo layout redirect — server akcije otvorene za `inactive` | `lib/actions/safe-action.ts:37-49` |
| D-M1 (V1) | Srednji | Nema indeksa van unique constraint-a | `drizzle/` migracija |
| L-M1 (V5) | Srednji | `completeOnboarding` je replayable | `app/onboarding/actions.ts:21-66` |
| S-M5 | Srednji | Nema bezbednosnih header-a (CSP, XFO, Referrer-Policy) | `next.config.ts` |
| S-L4 | Nizak | `npm audit`: 42 ranjivosti (7 moderate, 35 high) | `package.json` |
| S-M3 (S13) | Srednji | CRON_SECRET nije timing-safe; push endpoint bez allowlist-a; LIKE bez escape-a | 3 cron rute, `lib/validations/push.ts:9`, `lib/admin/users.ts:48` |

### Definicija „gotovo" za Fazu 1

- [ ] Woo webhook + backfill upisuju datum iz GMT polja; QA slučaj za večernju porudžbinu prolazi.
- [ ] Dupli webhook za istu porudžbinu **ne** duplira kapsule (dokazano ručnim double-fire testom).
- [ ] `refunded`/`cancelled` porudžbina obara VIP status na sledećem refresh-u.
- [ ] Double-tap na dozu ne troši više od 2 kapsule; undo ne može da poveća zalihe iznad polazne vrednosti.
- [ ] `inactive` korisnik dobija grešku iz `createAction`, ne samo redirect.
- [ ] Migracija sa indeksima primenjena; `EXPLAIN` na `orders` lookup-u koristi indeks.
- [ ] `npm audit` bez runtime `high` nalaza; `next` na najnovijoj 16.2.x.
- [ ] Response header-i sadrže CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`; nema `X-Powered-By`.
- [ ] lint + build + qa-dates + qa-routes zeleni.

---

## Prompt 1.1 — Woo integritet (S-H1, S-H2, S-H3, L-M3)

```text
Radimo Fazu 1 audit roadmap-a: WooCommerce integritet. Sve u lib/woocommerce/sync.ts.
Detalji nalaza su u docs/audit-faze-izmena.md i audit-izvestaj.html.

1) S-H1 — datumi bez GMT (linija ~121). date_paid || date_created se parsira kao lokalno
   vreme (na Vercelu = UTC), pa večernje porudžbine padaju u pogrešan beogradski dan.
   Fix: koristi date_paid_gmt || date_created_gmt i dodaj "Z" sufiks pre parsiranja;
   ažuriraj wooOrderSchema u lib/validations/woocommerce.ts da prihvata *_gmt polja
   (stara polja ostaju opcioni fallback za starije payload-e).

2) L-M3 — topUpSupplyForEmail (linija ~34) poredi mejl case-sensitively; Clerk čuva
   proizvoljan case pa se top-up tiho preskače. Fix: where(sql`lower(${profiles.email}) = ${email}`)
   sa normalizovanim (lower) ulazom. Proveri da li ista greška postoji i u
   refreshAccessStatusForEmail i getLatestOrderDate — ako da, popravi i tamo.

3) S-H2 — TOCTOU u upsertOrder (linije ~135-161): select-pa-insert/update; dva paralelna
   webhook-a oba vide „ne postoji" i oba pozovu topUpSupplyForEmail → dupli kapsule.
   Fix: jedan .onConflictDoUpdate(...).returning({ inserted: sql`(xmax = 0)` }) i top-up
   samo kad je red stvarno insertovan.

4) S-H3 — refund/cancel (linije ~99-101): cancelled/refunded se vrati kao skipped:status,
   red u orders ostaje sa starim statusom, pa getLatestOrderDate i dalje vidi aktivnu
   porudžbinu → kupac zadržava VIP 60 dana. Fix: ako wooOrderId već postoji, ažuriraj
   status reda na opozvani status; filtriraj sinhronizovane (validne) statuse u pristupnoj
   logici u lib/access/status.ts; pozovi refresh pristupa posle upisa.
   ODLUKA koju treba ispoštovati i dokumentovati u README „Poznata ograničenja":
   kapsule se pri refund-u NE oduzimaju (korisnik je fizički dobio proizvod).

Uslovi:
- Ne menjaj potpis webhook-a ni HMAC verifikaciju.
- Webhook i backfill moraju i dalje deliti isti upsertOrder put.
- Dodaj QA slučajeve u scripts/qa-dates.mts: (a) porudžbina u 23:30 po Beogradu upada u
  tačan dan, (b) refund obara pristup, (c) dupli upsert iste porudžbine top-upuje jednom.
- Na kraju pokreni: npm run lint && npm run build && npx tsx scripts/qa-dates.mts && npx tsx scripts/qa-routes.mts
- Objasni mi u par redova kako da ručno testiram dupli webhook (double-fire) lokalno.
```

## Prompt 1.2 — Supply atomičnost i prozori (S-M1, L-H1, L-M1)

```text
Faza 1, blok 2: atomičnost zaliha i poklapanje prozora.

1) S-M1 — app/(app)/protokol/actions.ts:31-81. Log upsert i supply update su dva odvojena
   upita, delta se računa iz prethodno pročitanog statusa: double-tap na istu dozu skida
   −4 kapsule, a clamp asimetrija „kuje" kapsule (1 → check-in → 0 → undo → 2).
   Fix: prethodni status uzmi iz upsert RETURNING-a (ne iz odvojenog select-a), a supply
   update napravi kao SQL delta: capsules_remaining = greatest(0, capsules_remaining + delta).
   Undo mora da vrati SAMO stvarno potrošeno (ako je clamp odsekao, ne vraćaj razliku) —
   ako to zahteva pamćenje potrošenog po logu, predloži najjednostavnije rešenje bez nove
   kolone; ako kolona nema alternativu, kaži mi pre nego što je dodaš.
   NAPOMENA: neon-http ne podržava db.transaction() — rešenje mora biti single-statement
   (CTE ili RETURNING lanac).

2) L-H1 — coverage prozor u lib/protocol/streak.ts:45 (addDaysIso(d, 60), 61 kalendarski dan
   inkluzivno) ne poklapa se sa VIP prozorom u lib/access/status.ts:34,137 (now - 60*DAY_MS,
   ms-aritmetika sa DST driftom) → poslednji pokriveni dan resetuje streak umesto da ga
   zamrzne. Fix: oba prozora na kalendarski dan po Beogradu, kroz helpere iz lib/dates.ts.
   Definiši jedan izvor istine za dužinu prozora (konstanta) i koristi ga na oba mesta.

3) L-M1 — app/onboarding/actions.ts:21-66. completeOnboarding je replayable: resetuje zalihe
   na packages×60, upisuje dupli focus_quiz_results red i pomera protocolStartDate.
   Fix: early-return ActionResult greške ako je onboardingCompleted već true; bound startDate
   na [danas−60, danas] u zod šemi (lib/validations/onboarding.ts).

Uslovi:
- Dodaj QA slučajeve u scripts/qa-dates.mts: granica coverage/VIP prozora (dan 60 i 61),
  double-tap check-in, check-in → undo ne povećava zalihe iznad polaznih.
- Na kraju: lint + build + qa-dates + qa-routes moraju biti zeleni.
```

## Prompt 1.3 — Zatvaranje pristupa i indeksi (S-M2, D-M1)

```text
Faza 1, blok 3: server-side gejt pristupa + indeksi.

1) S-M2 — lib/actions/safe-action.ts:37-49 proverava samo Clerk sesiju, ne i accessStatus.
   Paywall je trenutno samo redirect u app/(app)/layout.tsx, pa inactive korisnik može
   direktno da poziva logDose, updateSupply, addTask… Fix: dodaj requireActiveAccess
   proveru u createAction. Default: obavezna za sve (app) akcije; admin i onboarding
   akcije izuzete (onboarding se radi pre nego što status postoji — proveri i potvrdi).
   Neaktivnom korisniku vrati jasan ActionResult error (ti-forma, na srpskom latinicom),
   ne throw. Opt-out mora biti eksplicitan po akciji, ne implicitan.

2) D-M1 — nema indeksa van unique constraint-a. Ovo je JEDINA odobrena nova migracija
   u Fazi 1. Napravi jednu drizzle migraciju sa:
   - orders: funkcionalni indeks (lower(email), order_date DESC)
   - protocol_logs: parcijalni indeks (date) WHERE status='taken'
   - notifications_log: (user_id, type, status, sent_at)
   - focus_sessions (user_id), daily_tasks (user_id, date), focus_quiz_results (user_id, date)
   Ako drizzle-kit ne generiše funkcionalni/parcijalni indeks, napiši ga ručno u SQL fajlu
   migracije i uskladi šemu komentarom — reci mi šta si morao ručno.

Uslovi:
- Migraciju generiši, ali je NE primenjuj na produkciju bez moje potvrde; daj mi komandu.
- Proveri qa-routes.mts — ako se menja klasifikacija ruta, dopuni provere.
- Na kraju: lint + build + qa-dates + qa-routes.
```

## Prompt 1.4 — Bezbednosni hardening (S-M5, S-L4, S-M3)

```text
Faza 1, blok 4: bezbednosni hardening.

1) S-M5 — next.config.ts nema headers(). Dodaj:
   - CSP (barem default-src 'self' + dozvole koje app stvarno koristi: Clerk domeni, push
     servisi, inline style ako Tailwind/Next to zahteva — proveri build i runtime, ne
     pretpostavljaj), frame-ancestors 'none'
   - X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin,
     Permissions-Policy (isključi kameru/mikrofon/geolokaciju), X-Content-Type-Options: nosniff
   - poweredByHeader: false
   Testiraj da Clerk login, push subscribe i PWA install i dalje rade — CSP koji obori
   Clerk je gori od nedostatka CSP-a. Ako moraš da popustiš direktivu, napiši komentar zašto.

2) S-M3 (tri stvari):
   a) CRON_SECRET poređenje (`auth !== 'Bearer …'`) u sve 3 cron rute (app/api/cron/*) →
      timing-safe compare (crypto.timingSafeEqual sa izjednačenim dužinama).
   b) lib/validations/push.ts:9 prihvata bilo koji URL kao push endpoint → blind SSRF
      primitiv. Fix: allowlist push servisa u zod šemi (fcm.googleapis.com,
      web.push.apple.com, *.notify.windows.com, updates.push.services.mozilla.com —
      proveri aktualne hostove). Odbijeni endpoint = jasna greška, ne tiho ignorisanje.
   c) lib/admin/users.ts:48 — LIKE pretraga ne escape-uje % i _ . Fix: escape %, _ i
      zagrade pre ubacivanja u pattern.

3) S-L4 — npm audit (42 ranjivosti, 7 moderate / 35 high). Runtime-relevantno: next
   (postcss/nanoid, sharp) i sharp (libvips CVE-2026-33327/33328/35590/35591).
   Uradi: npm audit fix za dostupne (sharp, undici), ručni upgrade next na najnoviju
   16.2.x patch. Dev-only lanac (eslint/esbuild/shadcn CLI) ne diraj ako fix lomi build.
   Posle upgrade-a OBAVEZNO: npm run build (webpack, Serwist injector) + provera da SW
   i dalje precache-uje /~offline.
   Usput: prebaci shadcn iz dependencies u devDependencies (P-L3) i obriši nepotreban
   parametar font u scripts/generate-icons.ts:47 (lint warning).

Uslovi:
- Pošto se menja next verzija: bumpuj SW_VERSION ako se offline ponašanje menja.
- Na kraju: lint (0 warning-a) + build + qa-dates + qa-routes.
- Napiši mi kratku listu header-a koje treba da proverim curl-om posle deploy-a.
```

---

# Faza 2 — Pouzdanost isporuke i pristupa

**Trajanje:** ~2–3 nedelje · **Retencioni motor mora da bude pouzdan**
**Zašto:** podsetnici i supply alerti su ono što drži protokol — ako otkažu tiho, korisnik prekida i ne vraća se.

| ID | Ozb. | Stavka | Lokacija |
|---|---|---|---|
| L-M2 (V6) | Srednji | Admin access override se poništava na sledećem page load-u | `app/(app)/layout.tsx:26`, `lib/access/status.ts:67-96` |
| L-M5 (V3) | Srednji | Dispatcher: nema per-user try/catch, sekvencijalno slanje, nema timeout/maxDuration | `app/api/cron/notifications/route.ts:116-149` |
| D-L2 (V4) | Nizak | GH Actions jitter može da pojede 30-min prozor | scheduler + dijagnostika |
| P-M1 (K8) | Srednji | Nema `pushsubscriptionchange` handlera → tihi trajni gubitak push-a | `app/sw.ts` |
| S-L2 (V11a) | Nizak | Clerk `user.created` retry preskače refresh + welcome mejl | `app/api/webhooks/clerk/route.ts:44-75` |
| S-L1 (V11b) | Nizak | VAPID rotacija: reuse stare pretplate → 403 zauvek | `lib/push/client.ts:52-58` |
| S-M4 (S12) | Srednji | Dedup je check-then-act | `lib/push/dedup.ts` + dispatcher |
| S-M6 | Srednji | `savePushSubscription` preuzima `userId` tuđe pretplate | `app/(app)/podesavanja/push-actions.ts:26-33` |
| V10 | Srednji | Email opt-out: `email_alerts` + `List-Unsubscribe` + cap | email sloj |
| O-M1 | Srednji | Opservabilnost: samo `console.error` | ceo repo |
| O-M2 | Srednji | Nema CI na PR | `.github/workflows/` |

### Definicija „gotovo" za Fazu 2

- [ ] Jedan korisnik koji obori push ne obara ceo batch dispatchera.
- [ ] Rotacija push endpoint-a (simulirano) automatski re-subscribe-uje korisnika.
- [ ] Rotacija VAPID para ne ostavlja korisnika u trajnom 403.
- [ ] Dedup ima unique constraint — duplikat je nemoguć, ne samo malo verovatan.
- [ ] Korisnik može da isključi email alerte i to se poštuje.
- [ ] Greška u produkciji stiže do mene (error tracking), ne samo u Vercel log.
- [ ] CI na PR pokreće lint + qa-dates + qa-routes + build.

---

## Prompt 2.1 — Dispatcher hardening (L-M5, D-L2, P-M3)

```text
Faza 2, blok 1: hardening notification dispatchera. Podsetnici su retencioni motor —
tihi otkaz je najgori scenario.

1) L-M5 — app/api/cron/notifications/route.ts:116-149 (i ista logika u low-stock ruti):
   - streak-risk petlja nema per-user try/catch → jedan throw obara ceo batch. Dodaj.
   - slanje je sekvencijalno → chunked Promise.allSettled (chunk 10-20, reci mi zašto tolika).
   - web-push bez timeout-a → { timeout: 5000 } u sendNotification.
   - nema export const maxDuration → dodaj (uskladi sa Vercel planom, obrazloži vrednost).
   Rezultat rute mora da vrati broj poslatih / neuspelih / preskočenih po tipu, da
   dijagnostika ima šta da pokaže.

2) D-L2 — GH Actions jitter (10-20 min, ponekad preskočen run) može da pojede 30-min prozor.
   - Uvedi NOTIFICATION_WINDOW_MIN (default 45) i koristi ga SVUDA umesto hardkodovanog +30,
     uključujući push diagnose rutu (sad koristi hardkodovan +30).
   - Dnevni dedup već sprečava duplikate pa je širi prozor bezbedan — potvrdi to u kodu.
   - Dijagnostika treba da beleži rupe veće od prozora (kad dispatcher nije bio pozvan).
   - Ažuriraj docs/cron-setup.md i README env listu.

3) P-M3 — dodaj alert ako dispatcher nije pozvan N sati (predloži mehanizam koji ne zahteva
   novi servis: npr. provera „last run" u push diagnose ruti + jasan blocker u admin UI).

Uslovi:
- Nove/izmenjene /api rute bez Clerk sesije moraju u PUBLIC_ROUTES (lib/route-config.ts),
  inače Clerk vraća 404 i ruta je tiho mrtva. Dopuni scripts/qa-routes.mts.
- Dodaj QA slučajeve u qa-dates.mts za novi prozor (45 min) i za rupu u rasporedu.
- Na kraju: lint + build + qa-dates + qa-routes.
```

## Prompt 2.2 — Push pouzdanost (P-M1, S-M4, S-M6, S-L1, S-L2)

```text
Faza 2, blok 2: pouzdanost push pretplata.

1) P-M1 — app/sw.ts ima samo push i notificationclick handlere. Posle rotacije endpoint-a
   (browser/uređaj) korisnik trajno i TIHO gubi push, a stara pretplata ostaje u bazi.
   Fix: pushsubscriptionchange handler u SW (resubscribe sa istim VAPID ključem + POST na
   rutu koja upisuje novu i briše staru pretplatu) + re-upsert pretplate na app load.
   Nova ruta ide u PUBLIC_ROUTES ako nema Clerk sesiju (SW kontekst!) — ako mora bez sesije,
   zaštiti je drugačije i objasni kako. Bumpuj SW_VERSION.

2) S-M4 — lib/push/dedup.ts je check-then-act: filter pa slanje; dva preklapajuća run-a mogu
   oba da prođu. Fix: unique indeks (user_id, type, beogradski dan) na notifications_log +
   insert-PRE-slanja sa skip-on-conflict. Ako insert-pre-slanja znači da neuspelo slanje
   „potroši" dan, reši to statusom reda (pending → sent/failed) i objasni trade-off.
   Ovo zahteva migraciju — spoji je sa ostalim kolonama iz ove faze u JEDNU migraciju.

3) S-M6 — app/(app)/podesavanja/push-actions.ts:26-33: onConflict set: { userId: profile.id }
   preuzima tuđu pretplatu (otmica endpoint-a). Fix: ako endpoint pripada drugom korisniku,
   vrati grešku i ne diraj red (ili scoped unique (userId, endpoint) — izaberi i obrazloži).

4) S-L1 — lib/push/client.ts:52-58: subscribeToPush reuse-uje postojeću pretplatu starog
   VAPID ključa → 403 zauvek. Fix: uporedi existing.options.applicationServerKey sa
   trenutnim; na mismatch unsubscribe + fresh subscribe.

5) S-L2 — app/api/webhooks/clerk/route.ts:44-75: na retry onConflictDoNothing vrati prazan
   returning() pa se preskaču refreshAccessStatus i welcome mejl. Fix: i na conflict putu
   pozovi refresh + welcome, sa idempotencijom kroz notifications_log (type='welcome').

Uslovi:
- Jedna migracija za sve nove kolone/indekse iz ove faze.
- Napiši mi u odgovoru kako da ručno testiram pushsubscriptionchange (Chrome DevTools).
- Na kraju: lint + build + qa-dates + qa-routes.
```

## Prompt 2.3 — Pristup, email i opservabilnost (L-M2, V10, O-M1, O-M2)

```text
Faza 2, blok 3: pristup, email higijena i opservabilnost.

1) L-M2 — admin access override se poništava na sledećem page load-u korisnika (refresh u
   app/(app)/layout.tsx:26 → lib/access/status.ts:67-96), u OBA smera (vip i inactive),
   dok admin UI copy tvrdi da se poništava noćnim cron-om. Fix: access_override kolona
   (nullable enum + timestamp + ko je postavio) koju poštuju resolveAccessStatus i
   maintainAccessStatuses. Ako procenjuješ da je kolona preveliki zahvat sada, uradi
   minimalnu varijantu: ispravi copy i dodaj eksplicitno upozorenje u admin dijalog —
   ali mi jasno reci koju si varijantu izabrao i zašto.

2) V10 — email opt-out: dodaj email_alerts preferencu (podešavanja), List-Unsubscribe
   header u Resend mejlove, i cap na alerte (max 3 po epizodi niskih zaliha, reset na
   top-up). Bez ovoga low-stock alert može da spamuje.

3) O-M1 — opservabilnost je samo console.error. Dodaj error tracking (Sentry ili, ako želiš
   bez novog servisa, strukturni JSON log + dnevni cron izveštaj). Obavezno: agregacija
   notifications_log po danu kao „isporučenost" (koliko podsetnika je stvarno poslato) i
   prikaz u adminu. Ako predlažeš Sentry, reci mi cenu/limit free tier-a pre instalacije.

4) O-M2 — nema CI na PR. Dodaj .github/workflows/ci.yml: na push i pull_request pokreni
   npm ci → npm run lint → npx tsx scripts/qa-dates.mts → npx tsx scripts/qa-routes.mts →
   npm run build (webpack). Build treba env varijable — koristi dummy/placeholder vrednosti
   kao repo secrets ili build-time fallback, ali NE commituj tajne.

Uslovi:
- Sve nove kolone u JEDNU migraciju (spoji sa blokom 2.2 ako još nije primenjena).
- Na kraju: lint + build + qa-dates + qa-routes, i CI mora biti zelen na PR-u.
```

---

# Faza 3 — Dnevni UX temelji

**Trajanje:** ~2–3 nedelje · **Pristupačnost, otpornost i osećaj kvaliteta**
**Zašto posle 1 i 2:** ovo su stvari koje korisnik oseća svaki dan, ali ne gubi novac ni pristup zbog njih.

| ID | Ozb. | Stavka | Lokacija |
|---|---|---|---|
| U-M1 (V7) | Srednji | Nema `loading.tsx` / `error.tsx` / `global-error.tsx` | `app/` |
| U-M5 (V8) | Srednji | Sticky headeri bez safe-area top (iOS notch) | `components/app-shell/app-header.tsx:15`, `app/(admin)/admin/layout.tsx:38` |
| U-M2 (V9) | Srednji | `DoseCheckin` ne resync-uje props posle backfill-a | `components/protocol/dose-checkin.tsx:53` |
| U-M3 (S2) | Srednji | Touch targeti < 44px (Button `h-8`/`h-9`) | `components/ui/button.tsx:25-37` |
| U-M4 (S3) | Srednji | Lime kontrast ~1.1:1; status samo bojom u WeekStrip | protokol komponente |
| U-M7 (S4) | Srednji | Onboarding state se gubi na refresh | `app/onboarding/onboarding-wizard.tsx` |
| U-M6 (S5) | Srednji | Nema „Proveri ponovo" / „Pokušaj ponovo" | `/nemas-pristup`, `/~offline` |
| L-L4 (S9) | Nizak | Stale `today` prop preko ponoći | `DoseCheckin` |
| L-L3 (S1) | Nizak | Onboarding koristi `sr-RS` → ćirilica + UTC pomak | `onboarding-wizard.tsx:49-53` |
| U-L1 (N1) | Nizak | `lang="sr"`, generički errori, iOS hint na engleskom | `app/layout.tsx`, `safe-action.ts` |
| U-L2 (N2) | Nizak | `amber-*` van tokena, font var self-reference, nema `MotionConfig` | `globals.css`, komponente |
| U-L4 | Nizak | Plural „21 sesije" | `app/(app)/fokus/page.tsx:42` |

### Definicija „gotovo" za Fazu 3

- [ ] Nijedna ruta ne pokazuje praznu stranicu tokom učitavanja; crash pokazuje brand error stranicu.
- [ ] Na iPhone-u u standalone modu header ne ulazi pod status bar / Dynamic Island.
- [ ] Svi primarni CTA ≥ 44px.
- [ ] Status dana u WeekStrip je čitljiv bez boje (glyph + `aria-label`).
- [ ] Refresh tokom onboarding-a ne briše odgovore.
- [ ] Nema ćirilice nigde u app-u; `lang="sr-Latn"`.
- [ ] lint + build + qa-dates + qa-routes zeleni.

---

## Prompt 3.1 — Otpornost i iOS PWA (U-M1, U-M5, U-M6, U-M2, L-L4)

```text
Faza 3, blok 1: otpornost UI-ja i iOS PWA detalji.

1) U-M1 — nema loading.tsx, error.tsx ni global-error.tsx → prazna stranica na sporim
   upitima i generička greška na crash. Skeleton komponenta POSTOJI
   (components/ui/skeleton.tsx) ali se ne koristi. Dodaj:
   - app/(app)/loading.tsx sa skeletonom koji podseća na stvarni layout (ne spinner)
   - app/(app)/error.tsx i app/(admin)/admin/error.tsx sa reset() dugmetom
   - app/global-error.tsx (brand, minimalan — root layout ne važi tu)
   Copy na srpskom latinicom, ti-forma, u skladu sa dizajn sistemom.

2) U-M5 — sticky headeri bez pt-[env(safe-area-inset-top)] sudaraju se sa iOS status
   barom u standalone PWA. Popravi components/app-shell/app-header.tsx:15 i
   app/(admin)/admin/layout.tsx:38 (bottom nav već ima safe-area — uskladi pristup).

3) U-M6 — /nemas-pristup nema „Proveri ponovo" dugme, a /~offline nema „Pokušaj ponovo";
   u standalone PWA-u nema pull-to-refresh ni reload UI-ja pa je korisnik zaglavljen.
   Dodaj oba (router.refresh() / location.reload()). Bumpuj SW_VERSION zbog /~offline.

4) U-M2 — components/protocol/dose-checkin.tsx:53 inicijalizuje state jednom iz
   useState(doses…) → desync posle backfill-a današnjeg dana iz WeekStrip dijaloga.
   Fix: seed pattern kao u components/focus/daily-tasks.tsx:24-28.

5) L-L4 — stale „today" prop preko ponoći: check-in posle ponoći bez refresha tiho upada
   u „juče" (unutar backfill prozora pa ne baca grešku). Fix: visibilitychange →
   router.refresh() u app shell-u (debounce da ne spamuje refresh).

Uslovi:
- Boje samo kroz brand tokene. Bez novih zavisnosti.
- Na kraju: lint + build + qa-dates + qa-routes.
```

## Prompt 3.2 — Pristupačnost i touch targeti (U-M3, U-M4)

```text
Faza 3, blok 2: pristupačnost.

1) U-M3 — components/ui/button.tsx:25-37: shadcn default je h-8 (32px), lg h-9 (36px);
   CTA dugmad („Naruči dopunu", „Sačuvaj"…) su ispod WCAG 2.5.5 i Apple HIG 44px.
   Fix: dodaj xl size (h-11/h-12, pill radius po dizajn sistemu) i primeni ga na SVE
   primarne CTA u app-u (prođi kroz protokol, zalihe, fokus, podešavanja, onboarding,
   nemas-pristup). Usput: u DoseCheckin uvedi per-dose pending state umesto zajedničkog
   isPending (sada oba dugmeta izgledaju kao da se učitavaju).

2) U-M4 — lime na belom ima kontrast ~1.1:1, što pada WCAG 1.4.11 za non-text elemente:
   - ring-ovi / lime fill-ovi na karticama → dodaj ring-1 ring-ink/20
   - statusne tačke u WeekStrip se oslanjaju SAMO na boju → dodaj check glyph u „complete"
     tačke i aria-label po danu (npr. „Ponedeljak 18. avgust — obe doze")
   - dodaj caption „Dodirni dan da ispraviš" (WeekStrip je klikabilan, a to nije očigledno)

Uslovi:
- Ne diraj brand paletu — rešavaj kontrast ring-ovima/glyph-ovima, ne menjanjem lime tokena.
- Proveri da postojeći a11y atributi (aria-pressed, role="checkbox", role="progressbar")
  ostanu konzistentni.
- Na kraju: lint + build + qa-dates + qa-routes.
```

## Prompt 3.3 — Onboarding, copy i doslednost (U-M7, L-L3, U-L1, U-L2, U-L4)

```text
Faza 3, blok 3: onboarding perzistencija, copy i dizajn doslednost.

1) U-M7 — onboarding state (8 odgovora kviza + podešavanja) živi samo u useState-u i gubi
   se na refresh. Fix: sessionStorage perzistencija wizard-a (restore na mount, clear posle
   uspešnog completeOnboarding). Pazi na SSR — čitaj storage samo na klijentu.

2) L-L3 — app/onboarding/onboarding-wizard.tsx:49-53 koristi
   toLocaleDateString('sr-RS') → ĆIRILICA (ostatak app-a je sr-Latn) + UTC-parse pomak dana.
   Fix: formatIsoDateSr (isti helper kao ostatak app-a). Pretraži repo za još pojava
   'sr-RS' / toLocaleDateString i popravi sve.

3) U-L1 — copy i i18n:
   - app/layout.tsx: lang="sr" → lang="sr-Latn"
   - lib/actions/safe-action.ts: generički „Došlo je do greške…" → konkretnije, ti-forma
   - iOS install hint je delom na engleskom („Share", „Add to Home Screen") → srpski copy
     sa nazivima kako ih iOS prikazuje na srpskom (ako iOS nema srpski, ostavi original
     u zagradi)

4) U-L2 — dizajn doslednost:
   - amber-* van brand tokena (supply-card, push dijagnostika) → uvedi --color-warn token
     u @theme i koristi njega
   - --font-sans: var(--font-sans) self-reference u @theme inline je krhka — popravi
     definiciju (radi preko Next font varijable, ali ne treba da se oslanja na to)
   - dodaj globalni MotionConfig reducedMotion="user"
   - ujednači kartice: negde shadow-soft ring-1 na div, negde shadcn Card → izaberi jedan
     sistem i primeni ga

5) U-L4 — app/(app)/fokus/page.tsx:42: plural je netačan za 21+ („21 sesije").
   Fix: pluralSr(sessions, 'sesija', 'sesije', 'sesija') — funkcija već postoji u lib/format.ts.
   Pretraži repo za još mesta gde se broji bez pluralSr.

Uslovi:
- Ne uvodi i18n biblioteku — app je jednojezičan.
- Na kraju: lint + build + qa-dates + qa-routes.
```

---

# Faza 4 — Admin, performanse i polish

**Trajanje:** kontinuirano · **Pokreće se pre dostizanja pragova skale**

| ID | Ozb. | Stavka | Prag koji ga aktivira |
|---|---|---|---|
| D-M2 (V2) | Srednji | `averageStreak` vuče logove svih korisnika | ~300–500 aktivnih |
| L-L2 (S10/S11) | Nizak | Admin porudžbine: limit 100 bez pretrage; backfill bez lock-a | >100 porudžbina |
| U-L3 | Nizak | Recharts ~100 kB eager u client bundle-u | odmah (bundle) |
| L-M4 (S7) | Srednji | `addTask` count-then-insert race | odmah (integritet) |
| L-L1 (S8) | Nizak | Fokus bedževi se mogu farmovati | odmah (integritet) |
| D-M3 (N4) | Srednji | `notifications_log` raste neograničeno | ~3 meseca rada |
| L-L5 (N3) | Nizak | `logDose` dozvoljava check-in pre starta / u frozen danima | odmah |
| L-L6 | Nizak | Failed push se retry-uje svakih 15 min → spam u logu | odmah |
| O-L1 | Nizak | Nema unit testova za award/quiz/products/dosing | odmah |
| P-M2 | Srednji | Next 16: `middleware.ts` → `proxy.ts` | pre Next 17 |
| P-L2 | Nizak | Nema `robots.txt` | odmah |
| O-L2 | Nizak | Audit dokumentacija nije u git-u | odmah |

---

## Prompt 4.1 — Admin performanse i integritet (D-M2, L-L2, U-L3, D-M3)

```text
Faza 4, blok 1: admin performanse i skalabilnost.

1) D-M2 — lib/admin/metrics.ts:111-122 + lib/admin/user-stats.ts: averageStreak vuče logove
   SVIH korisnika (2 bulk upita + computeStreak u JS) pri svakom otvaranju admina → cliff na
   ~300-500 korisnika. Fix: računaj u noćnom cron-u i/ili current_streak kolona koju
   check-in ažurira. Takođe: isključi admine iz proseka (alwaysCovered ga naduvava).
   Ako uvodiš kolonu, spoji migraciju sa D-M3 pruning-om i eventualnim Faza 2 kolonama.

2) L-L2 — admin porudžbine: limit 100 bez pretrage (istorija nevidljiva) + backfill bez
   server-side lock-a. Fix: pretraga po mejlu/Woo ID-u + paginacija; lock (red ili flag) za
   backfill koji vraća 409 ako je već u toku. Pazi na LIKE escape iz S-M3 (Faza 1).

3) U-L3 — Recharts je ~100 kB gzip eager u client bundle-u za jedan mali bar chart na
   dashboardu. Fix: next/dynamic lazy import sa skeletonom (ili čist CSS bar row ako
   procenjuješ da je grafikon dovoljno prost — predloži pre implementacije).

4) D-M3 — notifications_log raste neograničeno (svaki push/mejl = red zauvek). Fix:
   periodični pruning starijih od 90 dana u istom cron prozoru. Ne briši redove koji su
   deo dedup logike za trenutni dan.

Uslovi:
- Meri i reci mi pre/posle: broj upita i vreme za /admin, i bundle size dashboarda.
- Na kraju: lint + build + qa-dates + qa-routes.
```

## Prompt 4.2 — Integritet fokusa i protokola (L-M4, L-L1, L-L5, L-L6)

```text
Faza 4, blok 2: integritet fokus i protokol logike.

1) L-M4 — app/(app)/fokus/actions.ts:49-59: addTask je count-then-insert → race dozvoljava
   4+ zadataka uprkos limitu 3. Fix: atomski INSERT … WHERE (SELECT count(*) …) < 3 sa
   RETURNING proverom (neon-http ne podržava transakcije — mora single statement).

2) L-L1 — app/(app)/fokus/actions.ts:25-43 + components/focus/pomodoro-timer.tsx: fokus
   bedževi se mogu farmovati jer completed flag stiže od klijenta; plus dupli persist iz
   2 taba preko localStorage. Fix: klijent šalje startedAt, server validira (startedAt ≤ now,
   trajanje konzistentno sa konfigurisanim blokom, nema preklapanja sesija); sinhroni clear
   localStorage pre persist-a.

3) L-L5 — logDose dozvoljava check-in pre protocolStartDate i u frozen danima (troši
   kapsule, ne ulazi u streak → korisnik gubi kapsule bez efekta). Fix: odbij dane pre
   starta i zamrznute dane sa jasnom greškom. Dokumentuj u README: 1-day-gap u
   mergeCoveredRanges i DST 02:xx rupe.

4) L-L6 — failed push (403) se retry-uje svakih 15 min unutar prozora → notifications_log
   raste i troškovi rastu. Fix: cooldown na failed tip (ne retry istog tipa unutar sat
   vremena); ako je 403, razmisli o markiranju pretplate kao mrtve (uskladi sa P-M1/S-L1
   iz Faze 2).

Uslovi:
- Dodaj QA slučajeve u qa-dates.mts za frozen/pre-start check-in i za failed cooldown.
- Na kraju: lint + build + qa-dates + qa-routes.
```

## Prompt 4.3 — Testovi, migracija konvencije i higijena (O-L1, P-M2, P-L2, O-L2, P-L1)

```text
Faza 4, blok 3: testovi i higijena.

1) O-L1 — QA harness pokriva datume/streak/rute, ali ne award engine, quiz scoring, supply
   matematiku i Woo payload mapping. Dodaj unit testove (vitest) za:
   lib/badges/award.ts, lib/quiz/focus-quiz.ts, lib/woocommerce/products.ts,
   lib/protocol/dosing.ts. Dodaj npm script (test) i uključi ga u CI iz O-M2 (Faza 2).
   Postojeći qa-*.mts harness NE prepisuj u vitest — oni su namerno standalone.

2) P-M2 — Next 16 deprecira middleware.ts konvenciju u korist proxy.ts (build upozorava).
   PRE migracije pročitaj node_modules/next/dist/docs/ i proveri šta Clerk API očekuje za
   novu konvenciju — ne migriraj naslepo. Posle preimenovanja OBAVEZNO pokreni
   qa-routes.mts (26 provera klasifikacije ruta) i ručno potvrdi da /admin gejt i
   PUBLIC_ROUTES i dalje rade. Ako Clerk još ne podržava proxy.ts, NE migriraj —
   samo dokumentuj u CLAUDE.md kao poznat tehnički dug.

3) P-L2 — dodaj robots.txt (disallow /admin, /api). Sitemap nije potreban za
   autentikovanu app; javne stranice (landing, style-guide) razmotri posebno.

4) P-L1 — SW ima skipWaiting: true + clientsClaim: true → novi SW preuzima odmah i može
   preseći in-flight zahteve pri deploy-u. Za MVP je prihvatljivo; predloži (ne implementiraj
   bez moje potvrde) varijantu sa promptom „Nova verzija je dostupna".

5) O-L2 — commituj audit dokumentaciju u docs/ (audit-izvestaj.html, docs/audit-roadmap-2026-08.md,
   ovaj fajl) da nalazi budu verzionisani.

Uslovi:
- Na kraju: lint + build + test + qa-dates + qa-routes.
```

---

# Pre Faze 2 proizvoda (Stripe) — strukturni preduslovi

Ovo nije faza izmena nego **blokada** za Fazu 2 scope-a (Stripe, wellness alati, 30-day insights):

1. **Transakcije.** `neon-http` ne podržava `db.transaction()`. Pre Stripe integracije prebaci
   write puteve koji traže atomičnost na `neon-serverless` (WebSocket Pool): check-in + supply,
   onboarding + quiz, Stripe callback + order. Ne pretpostavljaj da `db.transaction()` radi.
2. **Jedna migracija za Fazu 2.** `access_override`, `email_alerts`, eventualno `current_streak` —
   dodati zajedno sa Stripe kolonama, ne u više odvojenih migracija.
3. **Scheduler.** Plaćeni cron (cron-job.org ili Vercel Pro) čim korisnici porastu — pouzdanost
   podsetnika je retencioni motor proizvoda, a GH Actions je trenutno jedina tačka otkaza.
4. **Stripe zahteva US entitet** za srpske firme — tvrdo ograničenje, vidi `CLAUDE.md`.

## Prompt — priprema za Fazu 2 (pokreni kad zatvoriš Faze 1–3)

```text
Priprema za Fazu 2 proizvoda. NE implementiraj Stripe — samo strukturni preduslovi.

1) Prebaci write puteve koji traže atomičnost sa neon-http na neon-serverless (WebSocket Pool):
   check-in + supply, onboarding + quiz. Read putevi mogu ostati na http drajveru ako je to
   jeftinije — predloži podelu i obrazloži (cold start, connection overhead na Vercel Edge/Node).
   Posle prelaska, single-statement rešenja iz Faze 1 (S-M1) mogu ostati — ne prepisuj ih u
   transakcije bez razloga, samo dokumentuj šta je sada moguće.

2) Napravi JEDNU migraciju sa kolonama koje Faza 2 traži: access_override (ako nije već
   dodata u Fazi 2 roadmap-a), email_alerts, current_streak — plus placeholder za Stripe
   (subscription_id, subscription_status, current_period_end) ako procenjuješ da je bolje
   odjednom. Ako preporučuješ da Stripe kolone čekaju, reci zašto.

3) Ažuriraj CLAUDE.md: zatvori Faze 1-4 audit roadmap-a, upiši šta je promenjeno u
   konvencijama (drajver, transakcije, novi tokeni, novi env varijable) i osveži README
   env launch listu.

Na kraju: lint + build + test + qa-dates + qa-routes.
```

---

# Pragovi za skalu

| Prag | Šta puca | Reakcija |
|---|---|---|
| ~300–500 aktivnih | Admin dashboard (`averageStreak` vuče sve logove) | D-M2 (Faza 4) |
| ~10k porudžbina | Svaki page load radi `lower(email)` scan nad `orders` | D-M1 (Faza 1) |
| >100 porudžbina | Admin istorija porudžbina nevidljiva | L-L2 (Faza 4) |
| Neon free tier | Autosuspend; scheduler na 1 min budi bazu 24/7 | Ostati na 15 min |
| Public repo | GH Actions besplatni, ali tajne moraju kao repo secrets | Već podešeno; rotirati pre launch-a |

---

*Generisano iz `audit-izvestaj.html` (19. avgust 2026) — 24. avgust 2026.*
