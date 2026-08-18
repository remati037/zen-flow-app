# ZenFlow PWA — Finalni plan implementacije (završetak Faze 1)

## Kontekst

Revizija plana (`zenflow-prd.md`, `zenflow-plan-implementacije.md` u korenu repo-a) naspram trenutnog koda pokazala je:

**Urađeno i solidno (koraci 1.1–1.4):** Clerk auth + role u `publicMetadata` + middleware gating; Clerk webhook → `profiles`; access logika (60-dnevni VIP prozor, `lib/access/status.ts`) + cron; WooCommerce webhook sync + admin backfill; onboarding 4-step wizard; Resend email (welcome + low-stock) + `notifications_log`; Serwist PWA + offline; app shell (sidebar/bottom-nav); admin shell; kompletna Drizzle šema za SVE Faza-1 tabele; safe-action factory; dosing matematika.

**Nedostaje (sve su "Uskoro" stubovi):** protocol tracker + streak, zalihe UI, Pomodoro, bedževi (nema award logike), dashboard (samo account info), podešavanja UI (action postoji), admin stranice, i **kompletan Web Push** (nema `web-push` dep, VAPID, SW handlera, subscribe perzistencije).

**Poznati problemi za fix:** (1) timezone bug — `todayIso`/`estimateRunoutDate` koriste UTC `toISOString().slice(0,10)` → off-by-one oko ponoći po Beogradu; (2) supply se samo seed-uje na onboardingu, ništa ga ne smanjuje; (3) nepoznati SKU-ovi se tiho preskaču u sync-u (SKU-ovi NURO-001/002 su **pravi** — full/refill — ali warning treba); (4) minimalan shadcn set; (5) docs nisu u `/docs` kako CLAUDE.md nalaže.

**Odluke korisnika (zaključano):**
- Pun Web Push u MVP (dose reminderi, streak-at-risk, low-stock).
- Streak se **pauzira** (zamrzava) dok je korisnik `inactive`; nova kupovina ga nastavlja.
- Daily tasks ("3 najvažnija zadatka") ulaze u MVP uz Pomodoro.
- Onboarding obogaćen sa SVE ČETIRI stvari: story intro slajdovi, personalizovan Focus Score rezultat (gauge + 30-dnevni plan), gamifikacija (animirani progress, confetti, prvi bedž), kviz jedno-po-jedno pitanje sa emoji skalama.
- Cron za notifikacije: **eksterni scheduler** (cron-job.org ili GitHub Actions → `/api/cron/notifications` sa `Authorization: Bearer CRON_SECRET`), ne Vercel Pro.

## Globalne odluke

- **Timezone:** novi modul `lib/dates.ts` = jedini izvor "danas": `belgradeToday()` ('YYYY-MM-DD' preko `Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Belgrade' })`), `belgradeTimeHM()`, `addDaysIso(iso, days)` (čista string aritmetika, bez lokalnog `Date` drifta). Mora ostati client-safe (bez `server-only`). Nigde više `toISOString().slice(0,10)`.
- **Animacije:** `motion` (framer-motion, import iz `motion/react`) za onboarding tranzicije i gauge; CSS/`tw-animate-css` za jednostavne reveal-ove u app stranicama.
- **Confetti:** `canvas-confetti` + wrapper `lib/confetti.ts` sa brand presetom (lime `#DEFE9C`, ink navy, belo).
- **Novi dep-ovi:** `web-push` (+`@types/web-push`), `motion`, `canvas-confetti` (+types), `recharts`.
- **shadcn dodaci (jednom, u 1.5):** dialog, progress, tabs, switch, checkbox, label, select, separator, skeleton, tooltip, table, sonner (`<Toaster />` u `app/layout.tsx`).
- **Reuse:** `createAction` iz `lib/actions/safe-action.ts` za sve akcije; `lib/email/send.ts` konvencije za push send layer; `lib/protocol/dosing.ts`; postojeće validacije `logDoseSchema`, `updateSupplySchema`.

---

## Korak 1.5 — Fixes & temelji (prvo, sve zavisi od ovoga)

- Kreiraj `lib/dates.ts` (gore opisano).
- `lib/protocol/dosing.ts`: `estimateRunoutDate` prima ISO string i koristi `addDaysIso`. Ažuriraj pozivaoce: `app/onboarding/actions.ts` (zameni UTC today sa `belgradeToday()`), `app/onboarding/onboarding-wizard.tsx` (`todayIso()` → `lib/dates.ts`).
- `lib/woocommerce/products.ts` / `sync.ts`: SKU-ovi NURO-001 (full) i NURO-002 (refill) su pravi — samo skini "⚠️ POPUNITI" komentar i dodaj **glasan `console.warn`** kad porudžbina nema poznat SKU (kraj tihog preskakanja).
- `git mv zenflow-prd.md zenflow-plan-implementacije.md docs/` + ažuriraj reference u CLAUDE.md.
- Instaliraj dep-ove + shadcn komponente; mount `<Toaster richColors position="top-center" />`; kreiraj `lib/confetti.ts`.

**Gotovo kad:** build prolazi; onboarding i dalje radi; nepoznat SKU loguje warning; grep čist od `toISOString().slice(0,10)` u `app/` i `lib/`; docs u `/docs`.

## Korak 1.6 — Protocol tracker + streak (core retencioni loop)

**Streak algoritam** — čista funkcija u `lib/protocol/streak.ts`:
- Dan je **kompletan** kad postoje `morning` i `evening` logovi sa `status='taken'`.
- **Pokrivenost** (aktivni periodi) izvodi se iz `orders` (isti izvor kao access_status, bez nove tabele): dan D je pokriven ako postoji porudžbina sa `orderDate ∈ [D−60d, D]` (admin: uvek). Pokriveni intervali `[orderDate, orderDate+60d]`, merge-ovani.
- `computeStreak({ completedDates, coveredRanges, today, startDate }) → { current, longest, todayComplete }`: hodaj unazad od `today`; današnji nekompletan dan = grace (ne broji, ne prekida); nepokriven dan = **frozen** (skip — implementira pauzu); pokriven + kompletan = `current++`; pokriven + nekompletan = stop. Cap lookback 400 dana.
- Server helper `getStreakForUser(profile)` (isti fajl ili `lib/protocol/queries.ts`): učita logove + datume porudžbina po emailu, pozove čistu funkciju sa `belgradeToday()`.

**Check-in akcija** `app/(app)/protokol/actions.ts`:
- `logDose = createAction(logDoseSchema, …)` — upsert u `protocol_logs` (`onConflictDoUpdate` na unique `(userId, date, dose)`).
- **Supply decrement u istoj akciji:** novi `taken` → `capsulesRemaining = max(0, remaining − CAPSULES_PER_DOSE)`; undo (taken→skipped) → vrati +2; recompute `estimatedRunoutDate`. Guard: `date` sme biti samo danas ili juče.
- Vraća `{ streak, capsulesRemaining, newBadges }` (badges prazno do 1.11). `revalidatePath` za `/protokol`, `/dashboard`, `/zalihe`.

**UI:** `app/(app)/protokol/page.tsx` (server) + `components/protocol/dose-checkin.tsx` (dve velike tap kartice Jutarnja/Večernja sa vremenima, optimistic toggle, sonner toast), `components/protocol/streak-header.tsx` (flame counter, lime) + 7-dnevni mini strip (tačke: complete/partial/missed/frozen).

**Gotovo kad:** check-in idempotentan; undo vraća kapsule; streak tačan uz simuliran inactive gap; datumi tačni u 00:30 po Beogradu.

## Korak 1.7 — Zalihe (supply) stranica + refill top-up

- `app/(app)/zalihe/actions.ts` — `updateSupply = createAction(updateSupplySchema, …)` (ručna korekcija + recompute runout).
- `app/(app)/zalihe/page.tsx` + `components/supply/supply-card.tsx`: veliki broj, dana preostalo (`estimateDaysRemaining`), runout datum, progress bar (lime), warning ≤14 kapsula, refill CTA → `NEXT_PUBLIC_SHOP_REFILL_URL`. Ručna korekcija kroz dialog.
- `lib/woocommerce/sync.ts`: posle upserta porudžbine za email sa postojećim profilom — **dodaj `capsulesTotal` na `supply.capsulesRemaining`** + recompute runout. Idempotentnost: top-up SAMO kad je upsert bio insert (nov `wooOrderId`). Backfill ruta prosleđuje `topUpSupply: false` (istorijske porudžbine ne naduvavaju zalihe).

**Gotovo kad:** check-in smanjuje zalihe; nova Woo porudžbina top-upuje tačno jednom (replay webhook = bez dupliranja); backfill ne dira supply.

## Korak 1.8 — Web Push infrastruktura

- Env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`npx web-push generate-vapid-keys`).
- `lib/push/send.ts` (server-only, po uzoru na `lib/email/send.ts`): `sendPushToUser({ userId, type, title, body, url, tag })` — sve subskripcije korisnika, `webpush.sendNotification` sa JSON payload-om; na 404/410 **obriši stale subscription red**; loguj u `notifications_log` (`channel: 'push'`); nikad ne baca.
- `app/sw.ts`: dodaj `push` listener (`showNotification` sa tag-om protiv dupliranja) i `notificationclick` (fokusiraj postojeći prozor ili `openWindow(data.url ?? '/dashboard')`).
- `lib/push/client.ts`: `subscribeToPush()` / `unsubscribeFromPush()` (pushManager + urlBase64ToUint8Array).
- `app/(app)/podesavanja/push-actions.ts`: `savePushSubscription`/`deletePushSubscription` preko `createAction`; nova šema `lib/validations/push.ts`; upsert na unique `endpoint`.
- `components/push/push-toggle.tsx` (shadcn switch) — koristi se u Podešavanjima i onboarding koraku 4 (**zameni goli `Notification.requestPermission()` pravim subscribe+persist**).
- Admin test ruta `app/api/admin/push/test/route.ts`.

**Gotovo kad:** subscribe upisuje u `push_subscriptions`; test push stiže na Android Chrome i iOS (instaliran PWA); klik otvara ciljnu rutu; unsubscribe briše red; stale endpointi se sami čiste.

## Korak 1.9 — Notification cron (dispatcher)

**Jedan dispatcher, ne per-type cron-ovi** (vremena doza su individualna):
- `app/api/cron/notifications/route.ts` — poziva se na **15 min sa eksternog schedulera** (cron-job.org ili GitHub Actions, `Authorization: Bearer CRON_SECRET` — rute to već podržavaju). Po run-u:
  1. `now` po Beogradu (`belgradeTimeHM`, `belgradeToday`).
  2. Aktivni profili (`accessStatus != 'inactive'`, `onboardingCompleted`) + današnji logovi.
  3. **Jutarnji reminder** (`dose_reminder_morning`): `now ∈ [doseMorningTime, +30min)` i nema morning loga → push "Vreme je za jutarnju dozu 🌿", url `/protokol`.
  4. **Večernji reminder** — isto za evening.
  5. **Streak-at-risk** (`streak_at_risk`): `now ∈ [max(21:00, eveningTime+90min), +30min)`, dan nekompletan, streak ≥ 1 → push "Tvoj niz od N dana je na ivici…".
  - **Dedup:** `lib/push/dedup.ts` → `wasNotifiedToday(userId, type)` preko `notifications_log` (granice beogradskog dana izračunate jednom po run-u). Proveri pre svakog slanja.
- `app/api/cron/low-stock/route.ts`: dopuni da šalje **email + push** (`sendPushToUser({ type: 'low_stock_alert', url: '/zalihe' })`); postojeći 3-dnevni dedup po kanalu.
- `vercel.json` ostaje za dnevne cron-ove; `/api/cron/notifications` NE ide u vercel.json (eksterni scheduler). DST se rešava automatski jer poredimo beogradsko zidno vreme preko `Intl`.
- Dokumentuj setup eksternog schedulera (URL, header, interval) u README ili `/docs`.

**Gotovo kad:** test korisnik sa dozom za par minuta dobija reminder tačno jednom (ručni replay → dedup blokira); streak-at-risk samo kad je dan nekompletan; low-stock ide na oba kanala; ništa ne ide `inactive` korisnicima.

## Korak 1.10 — Fokus stranica (Pomodoro + 3 zadatka)

- `lib/validations/focus.ts`: `saveFocusSessionSchema` (durationMin 1–120, completed, taskLabel?), task šeme (title ≤120). **Max 3 taska dnevno enforce-ovan u akciji**, ne samo u UI.
- `app/(app)/fokus/actions.ts`: `saveFocusSession`, `addTask`/`toggleTask`/`deleteTask` (scoped na `userId` + `date = belgradeToday()`).
- `components/focus/pomodoro-timer.tsx`: preseti 25/5 (+50/10), kružni SVG progress ring (lime), **timestamp-based countdown** (`endsAt`, derivacija na tick — preživljava tab throttling), `endsAt` u `localStorage` (refresh nastavlja), zvuk + `document.title` flash na kraju, opciono vezivanje za današnji task.
- `components/focus/daily-tasks.tsx`: 3 slota, checkbox, inline add, strike-through.
- `app/(app)/fokus/page.tsx` (server): današnji taskovi + statistika ("Danas: 3 sesije · 75 min").

**Gotovo kad:** sesija u DB sa tačnim trajanjem; refresh usred sesije nastavlja; 4. task odbijen server-side; taskovi se prirodno resetuju po danu.

### Prompt za novu sesiju (1.10)

```
Radimo na ZenFlow PWA (app.nurolab.rs). Pročitaj CLAUDE.md i docs/zenflow-finalni-plan-faza1.md.

Zadatak: implementiraj Korak 1.10 — Fokus stranica (Pomodoro + 3 dnevna zadatka).
Koraci 1.5–1.9 su gotovi i commitovani; 1.14 je delimično. Ne diraj ih osim ako 1.10 to ne zahteva.

Konvencije koje moraš da poštuješ:
- Šema je kompletna — `focus_sessions` i `daily_tasks` već postoje u lib/db/schema.ts. NEMA novih migracija.
- Sve server akcije idu kroz `createAction` iz lib/actions/safe-action.ts (vraća ActionResult, hvata greške).
- "Danas" je isključivo `belgradeToday()` iz lib/dates.ts. Nikad `toISOString().slice(0,10)`.
- Zod šeme u lib/validations/, po uzoru na lib/validations/protocol.ts.
- Dizajn: paper pozadina, bele kartice sa soft senkama, lime #DEFE9C kao jedini jak akcenat — samo Tailwind
  brand tokeni, bez hardkodovanih hex vrednosti. Uzor: components/supply/supply-card.tsx i
  components/protocol/dose-checkin.tsx. Toast preko `sonner` (Toaster je već mountovan).

Isporuka:
1. lib/validations/focus.ts — saveFocusSessionSchema (durationMin 1–120, completed: boolean, taskLabel? ≤120),
   addTaskSchema (title ≤120), toggleTaskSchema / deleteTaskSchema (id).
2. app/(app)/fokus/actions.ts — saveFocusSession, addTask, toggleTask, deleteTask. Sve scoped na profile.id;
   taskovi na date = belgradeToday(). Limit od 3 taska dnevno MORA da se enforce-uje u akciji (count pre
   inserta), ne samo u UI. toggle/delete proveravaju vlasništvo nad redom.
3. components/focus/pomodoro-timer.tsx (client) — preseti 25/5 i 50/10; kružni SVG progress ring (lime);
   timestamp-based countdown: čuvaj `endsAt` (epoch ms) i izvodi preostalo vreme na svakom ticku da preživi
   throttling neaktivnog taba; `endsAt` + preset u localStorage da refresh nastavi sesiju; na kraju kratak
   WebAudio beep (bez eksternog audio fajla) + flash document.title; opciono vezivanje za današnji task
   (taskLabel). Sesija se snima i kad je završena i kad je prekinuta (completed: false).
4. components/focus/daily-tasks.tsx (client) — 3 slota, inline add, checkbox, strike-through, optimistic update.
5. app/(app)/fokus/page.tsx (server) — zameni "Uskoro" stub; učitaj današnje taskove + statistiku
   ("Danas: 3 sesije · 75 min") kroz Promise.all.

Gotovo kad: sesija u DB sa tačnim trajanjem; refresh usred sesije nastavlja odbrojavanje; 4. task odbijen
server-side sa jasnom porukom; taskovi se prirodno resetuju po danu (bez cron-a); `npm run build` prolazi.

Na kraju: kratak rezime šta je urađeno + commit u stilu prethodnih ("Faza 1.10: ...").
```

## Korak 1.11 — Bedževi: katalog, award engine, stranica

- `lib/badges/catalog.ts` — MVP set: `protokol-zapocet` (onboarding), `prva-doza`, `niz-3`, `niz-7`, `niz-14`, `niz-30`, `prvi-fokus`, `fokus-10`, `puna-nedelja` (7 kompletnih dana ukupno).
- `lib/badges/award.ts` — `checkAndAwardBadges(userId, { trigger: 'dose' | 'focus' | 'onboarding' })`: računa samo metrike relevantne za trigger; insert sa `.onConflictDoNothing()` + `.returning()` → vraća SAMO novo-dodeljene (za celebraciju).
- **Trigger tačke:** kraj `logDose` (1.6 — popuni `newBadges`), kraj `saveFocusSession` (1.10), kraj `completeOnboarding` (dodeljuje `protokol-zapocet` — treba i 1.13). Bez cron awardinga u MVP.
- UI: `app/(app)/bedzevi/page.tsx` — grid: osvojeni u boji sa datumom, neosvojeni grayscale + katanac; `components/badges/badge-card.tsx`, `components/badges/badge-toast.tsx` (sonner + confetti burst kad akcija vrati `newBadges`).

**Gotovo kad:** streak 3 dodeljuje `niz-3` tačno jednom (replay = bez dupa); toast+confetti na award; onboarding dodeljuje prvi bedž.

### Prompt za novu sesiju (1.11)

```
Radimo na ZenFlow PWA (app.nurolab.rs). Pročitaj CLAUDE.md i docs/zenflow-finalni-plan-faza1.md.

Zadatak: implementiraj Korak 1.11 — Bedževi (katalog, award engine, stranica).
Koraci 1.5–1.10 su gotovi. Ovaj korak odblokira dashboard (1.12) i onboarding celebraciju (1.13).

Konvencije:
- Tabela `badges` postoji u lib/db/schema.ts sa unique (user_id, badge_key). NEMA novih migracija.
- Akcije kroz `createAction` (lib/actions/safe-action.ts); "danas" kroz `belgradeToday()` (lib/dates.ts).
- Streak dolazi iz `getProtocolState(profile)` / lib/protocol/streak.ts — ne pisati novu streak logiku.
- Dizajn: Tailwind brand tokeni (paper / ink / lime #DEFE9C), bez hardkodovanih hex vrednosti.
- Confetti wrapper već postoji: lib/confetti.ts. Toast: sonner.

Isporuka:
1. lib/badges/catalog.ts — MVP set sa ključem, naslovom, opisom i lucide ikonom:
   protokol-zapocet, prva-doza, niz-3, niz-7, niz-14, niz-30, prvi-fokus, fokus-10, puna-nedelja
   (7 kompletnih dana ukupno). Katalog je jedini izvor istine za redosled i tekstove.
2. lib/badges/award.ts — `checkAndAwardBadges(userId, { trigger: 'dose' | 'focus' | 'onboarding' })`:
   računa SAMO metrike relevantne za trigger (ne skenira sve na svaki poziv); insert sa
   .onConflictDoNothing() + .returning() → vraća isključivo novo-dodeljene ključeve. Nikad ne baca.
3. Trigger tačke:
   - app/(app)/protokol/actions.ts → na kraju `logDose` popuni `newBadges` (sad je hardkodovan prazan niz
     sa TODO komentarom "do koraka 1.11").
   - app/(app)/fokus/actions.ts → na kraju `saveFocusSession`.
   - app/onboarding/actions.ts → na kraju `completeOnboarding` dodeli `protokol-zapocet` i vrati ga.
4. app/(app)/bedzevi/page.tsx (server) — zameni "Uskoro" stub: grid, osvojeni u boji sa datumom osvajanja,
   neosvojeni grayscale + katanac + opis kako se osvaja. Progres "5/9 osvojeno".
5. components/badges/badge-card.tsx i components/badges/badge-toast.tsx — toast + confetti burst kad akcija
   vrati newBadges (helper koji pozivaju i protokol i fokus stranica).

Gotovo kad: streak 3 dodeljuje niz-3 tačno jednom (ponovni check-in ne duplira); toast + confetti se okinu
na award; onboarding dodeljuje prvi bedž; `npm run build` prolazi.

Na kraju: kratak rezime + commit ("Faza 1.11: ...").
```

## Korak 1.12 — Dashboard (Početna)

- `app/(app)/dashboard/page.tsx` (server, `Promise.all`): današnji logovi + streak, supply, fokus statistika, poslednji bedževi, `focusScoreBaseline`, broj dana protokola.
- `components/dashboard/`: `greeting-header.tsx` ("Dobro jutro, Marko — dan 12 protokola"), `protocol-cta-card.tsx` (status doza + inline check-in reuse 1.6 akcije + streak flame), `supply-mini-card.tsx`, `focus-mini-card.tsx`, `recent-badges-row.tsx`, `adherence-chart.tsx` (Recharts bar poslednjih 14 dana, lime na paper-gray). Empty states za dan 1.

**Gotovo kad:** sve realno na jednom mobilnom ekranu; check-in sa dashboarda ažurira streak bez navigacije; server component bez client fetch-a.

### Prompt za novu sesiju (1.12)

```
Radimo na ZenFlow PWA (app.nurolab.rs). Pročitaj CLAUDE.md i docs/zenflow-finalni-plan-faza1.md.

Zadatak: implementiraj Korak 1.12 — Dashboard (Početna).
Koraci 1.5–1.11 su gotovi. Ovo je agregacija postojećih feature-a, ne nova logika — maksimalno reuse.

Konvencije:
- app/(app)/dashboard/page.tsx je trenutno privremena "Tvoj nalog" kartica — zameni je u celosti.
- Server component, sav podatak kroz jedan Promise.all. BEZ client fetch-a i bez useEffect data loading-a.
- Reuse: `getProtocolState(profile)` (lib/protocol/queries.ts), supply query iz zalihe stranice,
  fokus statistika iz 1.10, `lib/badges/catalog.ts` iz 1.11, `belgradeToday()` iz lib/dates.ts.
- Recharts je već instaliran. Dizajn: Tailwind brand tokeni (paper / ink / lime), bez hardkodovanih hex.
- Mobile-first — sve mora da ima smisla na jednom telefonskom ekranu, desktop je nadogradnja.

Isporuka — components/dashboard/:
1. greeting-header.tsx — "Dobro jutro/popodne/veče, {ime} — dan N protokola" (N = dani od početka protokola).
2. protocol-cta-card.tsx — status obe doze + inline check-in koji zove POSTOJEĆU `logDose` akciju iz
   app/(app)/protokol/actions.ts (bez duplirane logike) + streak flame.
3. supply-mini-card.tsx — preostale kapsule, dana do isteka, refill CTA kad je nisko.
4. focus-mini-card.tsx — današnje sesije/minuti + link na /fokus.
5. recent-badges-row.tsx — poslednjih 3–4 osvojena bedža.
6. adherence-chart.tsx — Recharts bar chart poslednjih 14 dana (lime na paper), 0/1/2 doze po danu.
Sve komponente moraju imati smislen empty state za dan 1 (nema logova, nema bedževa, nema sesija).

Gotovo kad: sve je realno i staje na jedan mobilni ekran uz scroll; check-in sa dashboarda ažurira streak
bez navigacije (revalidatePath već postoji u logDose); nema client data fetch-a; `npm run build` prolazi.

Na kraju: kratak rezime + commit ("Faza 1.12: ...").
```

## Korak 1.13 — Onboarding obogaćivanje (najveći pojedinačni korak; može 1.13a/1.13b)

Rework `app/onboarding/onboarding-wizard.tsx` u folder `app/onboarding/steps/`. Novi tok: **0. Story intro (3 slajda)** → 1. Protokol setup → 2. Doze → 3. Kviz (jedno-po-jedno) → 3b. **Rezultat** → 4. Notifikacije (pravi push subscribe iz 1.8) → **Celebracija**.

- `steps/intro-slides.tsx` — 3 slajda: (1) šta je ZenFlow protokol, (2) efekat se gradi doslednošću / bledi prekidom (core brand insight), (3) šta te čeka u appu. `AnimatePresence` tranzicije, skip link.
- `steps/quiz-step.tsx` — jedno pitanje po ekranu, horizontalni slide; **emoji skala** umesto 1–5 dugmadi (emoji setovi uz `FOCUS_QUIZ_QUESTIONS` u `lib/quiz/focus-quiz.ts` — proširi podatke, scoring netaknut); auto-advance ~350ms posle izbora.
- `steps/result-step.tsx` — animirani SVG **Focus Score gauge** (polukrug, motion spring sweep, lime→ink), score band label, "Tvoj 30-dnevni plan" — 2–3 personalizovana bulleta iz najslabijih odgovora (`buildPlanHighlights(answers)` u `lib/quiz/focus-quiz.ts`).
- Gamifikacija: animirani motion progress bar (lime, spring) umesto `ProgressDots`; `AnimatePresence mode="wait"` između koraka.
- Finish: `completeOnboarding` (vraća `protokol-zapocet` bedž iz 1.11) → celebracija: confetti, badge reveal card scale-in, CTA "Kreni na Dashboard".
- Wizard state ostaje client-side; jedna server akcija na kraju (bez parcijalne perzistencije).

**Gotovo kad:** ceo flow < 2 min; kviz auto-advance sa animacijom; gauge animira do tačnog skora; bulleti variraju po odgovorima; confetti + bedž na kraju; back navigacija radi svuda; i dalje jedan submit path.

### Prompt za novu sesiju (1.13)

```
Radimo na ZenFlow PWA (app.nurolab.rs). Pročitaj CLAUDE.md i docs/zenflow-finalni-plan-faza1.md.

Zadatak: implementiraj Korak 1.13 — obogaćivanje onboardinga.
Koraci 1.5–1.12 su gotovi. Ovo je najveći pojedinačni korak — ako proceniš da je preveliko za jedan prolaz,
podeli na 1.13a (struktura + intro slajdovi + kviz) i 1.13b (result gauge + gamifikacija + celebracija) i
javi mi pre nego što kreneš.

Polazna tačka: app/onboarding/onboarding-wizard.tsx (282 linije, jedan fajl) — razbij ga u
app/onboarding/steps/. Server akcija `completeOnboarding` u app/onboarding/actions.ts OSTAJE jedan submit
path na kraju — bez parcijalne perzistencije, wizard state ostaje client-side.

Novi tok: 0. Story intro (3 slajda) → 1. Protokol setup → 2. Vremena doza → 3. Kviz (jedno pitanje po
ekranu) → 3b. Rezultat → 4. Notifikacije → Celebracija.

Konvencije:
- `motion` (import iz 'motion/react') je već instaliran — koristi AnimatePresence mode="wait" između koraka.
- lib/confetti.ts (brand preset) i lib/quiz/focus-quiz.ts već postoje. Scoring u focus-quiz.ts NE menjaj,
  samo proširi podatke (emoji setovi po pitanju + `buildPlanHighlights(answers)`).
- Push subscribe u koraku 4 mora da koristi components/push/push-toggle.tsx iz 1.8 (pravi subscribe +
  perzistencija), a ne goli Notification.requestPermission().
- Tailwind brand tokeni (paper / ink / lime #DEFE9C), bez hardkodovanih hex vrednosti.

Isporuka:
1. steps/intro-slides.tsx — 3 slajda: (1) šta je ZenFlow protokol, (2) efekat se gradi doslednošću i bledi
   prekidom (core brand insight — ovo je razlog zašto app postoji), (3) šta te čeka u appu. AnimatePresence
   tranzicije + skip link.
2. steps/quiz-step.tsx — jedno pitanje po ekranu, horizontalni slide, emoji skala umesto 1–5 dugmadi,
   auto-advance ~350ms posle izbora, back radi.
3. steps/result-step.tsx — animirani SVG Focus Score gauge (polukrug, motion spring sweep, lime→ink),
   label skor benda, "Tvoj 30-dnevni plan" sa 2–3 personalizovana bulleta iz najslabijih odgovora
   (`buildPlanHighlights` u lib/quiz/focus-quiz.ts).
4. Gamifikacija: animirani motion progress bar (lime, spring) umesto ProgressDots.
5. Finish: `completeOnboarding` vraća bedž `protokol-zapocet` (1.11) → confetti + badge reveal card
   scale-in + CTA "Kreni na Dashboard".

Gotovo kad: ceo flow prolazi za < 2 min; kviz auto-advance animira; gauge stiže tačno do skora; bulleti se
menjaju u zavisnosti od odgovora; confetti + bedž na kraju; back navigacija radi na svakom koraku; i dalje
tačno jedan server submit; `npm run build` prolazi.

Na kraju: kratak rezime + commit ("Faza 1.13: ...").
```

## Korak 1.14 — Podešavanja UI (mali; može paralelno posle 1.8)

`app/(app)/podesavanja/page.tsx` + `components/settings/settings-form.tsx`: ime, vremena doza, `PushToggle` (1.8), email (read-only), access status + "VIP do <datum>" (poslednja porudžbina + 60d), sign-out. Koristi postojeći `updateSettings`; toast na save. Promena vremena doza automatski važi za sledeći dispatcher run.

**Gotovo kad:** save ažurira DB i reminder vremena; push toggle round-tripuje; validacija kroz postojeću šemu.

> **Status:** ✅ gotovo. `SettingsForm` (ime + vremena doza), `PushToggle`, i kartica "Nalog"
> (`components/settings/account-card.tsx`): email read-only, status bedž, "VIP do <datum>"
> (poslednja porudžbina + `VIP_WINDOW_DAYS`), refill CTA za `inactive`, sign-out.

### Prompt za novu sesiju (1.14)

```
Radimo na ZenFlow PWA (app.nurolab.rs). Pročitaj CLAUDE.md i docs/zenflow-finalni-plan-faza1.md.

Zadatak: dovrši Korak 1.14 — Podešavanja UI. Mali korak, može samostalno u bilo kom trenutku posle 1.8.

Već postoji i radi (ne prepravljaj bez potrebe):
- app/(app)/podesavanja/page.tsx sa dve kartice: "Profil i protokol" (SettingsForm) i "Notifikacije"
  (PushToggle).
- components/settings/settings-form.tsx — ime + vreme jutarnje/večernje doze, sonner toast, router.refresh().
- app/(app)/podesavanja/actions.ts — `updateSettings` kroz createAction + postojeća zod šema.

Fali (isporuka):
1. Kartica "Nalog": email (read-only, iz profile.email), access status kao badge (vip / subscriber /
   inactive) i, kad je vip, tekst "VIP do <datum>" — datum = poslednja porudžbina iz `orders` za taj email
   + 60 dana. Reuse logiku/konstante iz lib/access/status.ts umesto novog računanja; datume formatiraj
   preko lib/dates.ts.
2. Sign-out dugme (Clerk `SignOutButton`) na dnu, u ghost/pill stilu.
3. Kad je access status `inactive` — kratka poruka + CTA na NEXT_PUBLIC_SHOP_REFILL_URL.

Konvencije: server component učitava podatke, klijentske delove drži u components/settings/;
Tailwind brand tokeni, bez hardkodovanih hex vrednosti.

Gotovo kad: save i dalje ažurira DB i vremena remindera (dispatcher iz 1.9 ih čita na sledećem run-u);
push toggle round-tripuje; VIP datum se poklapa sa pravilom iz lib/access/status.ts; `npm run build` prolazi.

Na kraju: kratak rezime + commit ("Faza 1.14: ...").
```

## Korak 1.15 — Admin panel

- `app/(admin)/admin/page.tsx` — metrics kartice (ukupno/VIP/inactive, porudžbine 30d, današnji check-inovi, prosečan streak, push subs, notifikacije 7d) preko `lib/admin/metrics.ts` (`Promise.all` agregata); mali Recharts line dnevnih check-inova (14d).
- `admin/korisnici/page.tsx` — shadcn table: email, ime, status, streak, kapsule, poslednji check-in; server-side search po emailu (searchParams); row akcije kroz dialog: **ručni access override** (vip/inactive) i **resend welcome email** — akcije sa `{ admin: true }`. Napomena u dialogu: ručni `vip` bez porudžbine vraća noćni cron (`maintainAccessStatuses`) — MVP: dokumentovano ponašanje, bez schema izmene.
- `admin/porudzbine/page.tsx` — orders tabela + "Pokreni backfill" dugme na postojeći `/api/admin/woocommerce/backfill`.

**Gotovo kad:** admin vidi live listu sa streak-ovima; override radi i interakcija sa cron-om je dokumentovana; orders se poklapaju sa Woo; backfill iz UI-ja.

### Prompt za novu sesiju (1.15)

```
Radimo na ZenFlow PWA (app.nurolab.rs). Pročitaj CLAUDE.md i docs/zenflow-finalni-plan-faza1.md.

Zadatak: implementiraj Korak 1.15 — Admin panel.
Koraci 1.5–1.14 su gotovi.

Trenutno stanje:
- app/(admin)/admin/page.tsx sadrži samo push test kartice (PushToggle + PushTestButton) — ZADRŽI ih,
  premesti nadole i dodaj metrike iznad.
- app/(admin)/admin/korisnici/page.tsx i .../porudzbine/page.tsx su "Uskoro" stubovi.
- Admin gating već radi kroz middleware.ts (sessionClaims.metadata.role) — ne diraj auth.

Konvencije:
- Admin akcije kroz `createAction(..., { admin: true })` (lib/actions/safe-action.ts).
- shadcn `table`, `dialog`, `badge` su već instalirani. Recharts je instaliran.
- Server-side pretraga preko searchParams (bez client filtriranja cele liste).
- Tailwind brand tokeni, bez hardkodovanih hex vrednosti.

Isporuka:
1. lib/admin/metrics.ts — agregati kroz jedan Promise.all: ukupno korisnika / vip / inactive, porudžbine
   30d, današnji check-inovi, prosečan streak, broj push pretplata, poslate notifikacije 7d, i serija
   dnevnih check-inova za poslednjih 14 dana.
2. app/(admin)/admin/page.tsx — metrics kartice + mali Recharts line chart dnevnih check-inova (14d).
3. app/(admin)/admin/korisnici/page.tsx — shadcn tabela: email, ime, status, streak, preostale kapsule,
   poslednji check-in. Server-side search po emailu preko searchParams. Row akcije u dialogu:
   ručni access override (vip / inactive) i "pošalji welcome email ponovo" (reuse lib/email/send.ts).
   U dialogu jasno napiši napomenu: ručno postavljen `vip` bez porudžbine noćni cron
   (`maintainAccessStatuses`) vraća na inactive — u MVP-u je to dokumentovano ponašanje, BEZ izmene šeme.
4. app/(admin)/admin/porudzbine/page.tsx — tabela porudžbina (datum, email, SKU/tip, iznos, woo id) +
   dugme "Pokreni backfill" koje gađa postojeći /api/admin/woocommerce/backfill i prikaže rezultat.

Gotovo kad: admin vidi live listu korisnika sa streak-ovima; override radi i njegova interakcija sa cron-om
je vidljiva u UI-u; porudžbine se poklapaju sa Woo podacima; backfill se pokreće iz UI-ja; `npm run build`
prolazi.

Na kraju: kratak rezime + commit ("Faza 1.15: ...").
```

## Korak 1.16 — QA, hardening, launch

- E2E ručni pass PRD loop-a: registracija → Woo verifikacija → onboarding → check-in → streak → low-stock (oba kanala) → refill porudžbina → supply top-up → Pomodoro → bedževi → admin.
- Timezone matrica: check-in u 23:50 i 00:10 lokalno; DST sanity.
- iOS PWA: push samo kad je instaliran — `components/push/ios-install-hint.tsx` banner kad `Notification` nije dostupan u browser kontekstu.
- Env audit na Vercelu: VAPID, `CRON_SECRET`, Resend, Woo ključevi, `NEXT_PUBLIC_SHOP_REFILL_URL`; potvrdi eksterni scheduler setup.
- Offline page radi sa novim SW handlerima; bump SW. Lighthouse PWA + a11y; bez hardkodovanih hex boja van Tailwind configa.
- Ažuriraj CLAUDE.md (zatvori Fazu 1).

### Prompt za novu sesiju (1.16)

```
Radimo na ZenFlow PWA (app.nurolab.rs). Pročitaj CLAUDE.md i docs/zenflow-finalni-plan-faza1.md.

Zadatak: Korak 1.16 — QA, hardening i priprema za launch. Koraci 1.5–1.15 su gotovi; ovo zatvara Fazu 1.
Ovde NE dodajemo nove feature-e — samo verifikacija, popravke i dokumentacija.

Uradi redom i izvesti mi nalaze pre nego što bilo šta popravljaš:

1. Audit koda naspram "Gotovo kad" checkliste svakog koraka 1.5–1.15 iz plana. Napravi tabelu
   korak → prolazi / ne prolazi / nije proverljivo bez uređaja.
2. Timezone matrica: proveri ponašanje check-ina, streak-a i dedup-a u 23:50 i 00:10 po Beogradu (simuliraj
   kroz unit-style proveru čistih funkcija u lib/dates.ts i lib/protocol/streak.ts, ne ručno). DST sanity za
   granice dana. Grep da nigde nema `toISOString().slice(0,10)` u app/ i lib/.
3. iOS PWA: dodaj components/push/ios-install-hint.tsx — banner sa uputstvom za "Dodaj na početni ekran"
   kad `Notification` nije dostupan u browser kontekstu (iOS Safari van instaliranog PWA). Prikaži ga na
   podešavanjima i u onboarding koraku za notifikacije.
4. Env audit: uporedi .env.example sa onim što kod stvarno čita (VAPID trojka, CRON_SECRET, Resend, Woo
   ključevi, NEXT_PUBLIC_SHOP_REFILL_URL) i izlistaj šta mora da bude postavljeno na Vercelu. Potvrdi da je
   setup eksternog schedulera dokumentovan u docs/cron-setup.md.
5. Offline: proveri da app/~offline/page.tsx i dalje radi sa push/notificationclick handlerima iz 1.8;
   bump SW verziju ako je potrebno.
6. Provera dizajna: nijedna hardkodovana hex boja van Tailwind configa; osnovni a11y pass (fokus stanja,
   aria labele na icon-only dugmadima, kontrast na lime pozadinama).
7. Na kraju ažuriraj CLAUDE.md i README.md — zatvori Fazu 1 (roadmap čekboksovi, opis šta app sad radi).

E2E ručni pass koji ću ja odraditi (napiši mi ga kao checklistu za copy/paste u issue):
registracija → Woo verifikacija → onboarding → check-in → streak → low-stock (email + push) → refill
porudžbina → supply top-up → Pomodoro → bedževi → admin panel.

Na kraju: rezime nalaza + commit ("Faza 1.16: ...").
```

---

## Redosled i zavisnosti

`1.5` → `1.6` → `1.7` → `1.8` → `1.9` → `1.10` → `1.11` → `1.12` → `1.13` → `1.14` → `1.15` → `1.16`.
Paralelizabilno: 1.10 posle 1.5; 1.14 posle 1.8.

## Status (ažurirati po zatvaranju koraka)

| Korak | Status | Commit |
|---|---|---|
| 1.5 fixes & temelji | ✅ | `a52cd27` |
| 1.6 protokol + streak | ✅ | `f3368d6` |
| 1.7 zalihe + top-up | ✅ | `8822ca3` |
| 1.8 Web Push infra | ✅ | `c5e3d33`, `500f328` |
| 1.9 notification cron | ✅ | `385d917` |
| 1.10 Fokus | ⬜ | — |
| 1.11 Bedževi | ⬜ | — |
| 1.12 Dashboard | ⬜ | — |
| 1.13 Onboarding rework | ⬜ | — |
| 1.14 Podešavanja UI | 🟡 delimično | `bec7646` |
| 1.15 Admin panel | ⬜ | — |
| 1.16 QA + launch | ⬜ | — |

Svaki nezavršen korak ima **„Prompt za novu sesiju"** blok u svojoj sekciji — copy/paste u novu sesiju.

## Verifikacija (po koraku + finalno)

- Svaki korak ima "Gotovo kad" checklist iznad — prati ga pre prelaska na sledeći.
- Build kroz webpack (`--webpack`, ne Turbopack — Serwist injector; vidi memoriju).
- Finalno: kompletan E2E pass iz 1.16 + push test na realnom Android/iOS uređaju.

## Ključni postojeći fajlovi za reuse

- `lib/actions/safe-action.ts` (sve nove akcije), `lib/email/send.ts` (šablon za push send layer), `lib/protocol/dosing.ts`, `lib/access/status.ts`, `lib/validations/{protocol,supply}.ts` (već postoje, samo ih potrošiti), `app/sw.ts`, `app/onboarding/onboarding-wizard.tsx`, `vercel.json`, `lib/db/schema.ts` (šema je kompletna — **nema novih migracija u Fazi 1**).
