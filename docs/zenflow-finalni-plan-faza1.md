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

## Korak 1.11 — Bedževi: katalog, award engine, stranica

- `lib/badges/catalog.ts` — MVP set: `protokol-zapocet` (onboarding), `prva-doza`, `niz-3`, `niz-7`, `niz-14`, `niz-30`, `prvi-fokus`, `fokus-10`, `puna-nedelja` (7 kompletnih dana ukupno).
- `lib/badges/award.ts` — `checkAndAwardBadges(userId, { trigger: 'dose' | 'focus' | 'onboarding' })`: računa samo metrike relevantne za trigger; insert sa `.onConflictDoNothing()` + `.returning()` → vraća SAMO novo-dodeljene (za celebraciju).
- **Trigger tačke:** kraj `logDose` (1.6 — popuni `newBadges`), kraj `saveFocusSession` (1.10), kraj `completeOnboarding` (dodeljuje `protokol-zapocet` — treba i 1.13). Bez cron awardinga u MVP.
- UI: `app/(app)/bedzevi/page.tsx` — grid: osvojeni u boji sa datumom, neosvojeni grayscale + katanac; `components/badges/badge-card.tsx`, `components/badges/badge-toast.tsx` (sonner + confetti burst kad akcija vrati `newBadges`).

**Gotovo kad:** streak 3 dodeljuje `niz-3` tačno jednom (replay = bez dupa); toast+confetti na award; onboarding dodeljuje prvi bedž.

## Korak 1.12 — Dashboard (Početna)

- `app/(app)/dashboard/page.tsx` (server, `Promise.all`): današnji logovi + streak, supply, fokus statistika, poslednji bedževi, `focusScoreBaseline`, broj dana protokola.
- `components/dashboard/`: `greeting-header.tsx` ("Dobro jutro, Marko — dan 12 protokola"), `protocol-cta-card.tsx` (status doza + inline check-in reuse 1.6 akcije + streak flame), `supply-mini-card.tsx`, `focus-mini-card.tsx`, `recent-badges-row.tsx`, `adherence-chart.tsx` (Recharts bar poslednjih 14 dana, lime na paper-gray). Empty states za dan 1.

**Gotovo kad:** sve realno na jednom mobilnom ekranu; check-in sa dashboarda ažurira streak bez navigacije; server component bez client fetch-a.

## Korak 1.13 — Onboarding obogaćivanje (najveći pojedinačni korak; može 1.13a/1.13b)

Rework `app/onboarding/onboarding-wizard.tsx` u folder `app/onboarding/steps/`. Novi tok: **0. Story intro (3 slajda)** → 1. Protokol setup → 2. Doze → 3. Kviz (jedno-po-jedno) → 3b. **Rezultat** → 4. Notifikacije (pravi push subscribe iz 1.8) → **Celebracija**.

- `steps/intro-slides.tsx` — 3 slajda: (1) šta je ZenFlow protokol, (2) efekat se gradi doslednošću / bledi prekidom (core brand insight), (3) šta te čeka u appu. `AnimatePresence` tranzicije, skip link.
- `steps/quiz-step.tsx` — jedno pitanje po ekranu, horizontalni slide; **emoji skala** umesto 1–5 dugmadi (emoji setovi uz `FOCUS_QUIZ_QUESTIONS` u `lib/quiz/focus-quiz.ts` — proširi podatke, scoring netaknut); auto-advance ~350ms posle izbora.
- `steps/result-step.tsx` — animirani SVG **Focus Score gauge** (polukrug, motion spring sweep, lime→ink), score band label, "Tvoj 30-dnevni plan" — 2–3 personalizovana bulleta iz najslabijih odgovora (`buildPlanHighlights(answers)` u `lib/quiz/focus-quiz.ts`).
- Gamifikacija: animirani motion progress bar (lime, spring) umesto `ProgressDots`; `AnimatePresence mode="wait"` između koraka.
- Finish: `completeOnboarding` (vraća `protokol-zapocet` bedž iz 1.11) → celebracija: confetti, badge reveal card scale-in, CTA "Kreni na Dashboard".
- Wizard state ostaje client-side; jedna server akcija na kraju (bez parcijalne perzistencije).

**Gotovo kad:** ceo flow < 2 min; kviz auto-advance sa animacijom; gauge animira do tačnog skora; bulleti variraju po odgovorima; confetti + bedž na kraju; back navigacija radi svuda; i dalje jedan submit path.

## Korak 1.14 — Podešavanja UI (mali; može paralelno posle 1.8)

`app/(app)/podesavanja/page.tsx` + `components/settings/settings-form.tsx`: ime, vremena doza, `PushToggle` (1.8), email (read-only), access status + "VIP do <datum>" (poslednja porudžbina + 60d), sign-out. Koristi postojeći `updateSettings`; toast na save. Promena vremena doza automatski važi za sledeći dispatcher run.

**Gotovo kad:** save ažurira DB i reminder vremena; push toggle round-tripuje; validacija kroz postojeću šemu.

## Korak 1.15 — Admin panel

- `app/(admin)/admin/page.tsx` — metrics kartice (ukupno/VIP/inactive, porudžbine 30d, današnji check-inovi, prosečan streak, push subs, notifikacije 7d) preko `lib/admin/metrics.ts` (`Promise.all` agregata); mali Recharts line dnevnih check-inova (14d).
- `admin/korisnici/page.tsx` — shadcn table: email, ime, status, streak, kapsule, poslednji check-in; server-side search po emailu (searchParams); row akcije kroz dialog: **ručni access override** (vip/inactive) i **resend welcome email** — akcije sa `{ admin: true }`. Napomena u dialogu: ručni `vip` bez porudžbine vraća noćni cron (`maintainAccessStatuses`) — MVP: dokumentovano ponašanje, bez schema izmene.
- `admin/porudzbine/page.tsx` — orders tabela + "Pokreni backfill" dugme na postojeći `/api/admin/woocommerce/backfill`.

**Gotovo kad:** admin vidi live listu sa streak-ovima; override radi i interakcija sa cron-om je dokumentovana; orders se poklapaju sa Woo; backfill iz UI-ja.

## Korak 1.16 — QA, hardening, launch

- E2E ručni pass PRD loop-a: registracija → Woo verifikacija → onboarding → check-in → streak → low-stock (oba kanala) → refill porudžbina → supply top-up → Pomodoro → bedževi → admin.
- Timezone matrica: check-in u 23:50 i 00:10 lokalno; DST sanity.
- iOS PWA: push samo kad je instaliran — `components/push/ios-install-hint.tsx` banner kad `Notification` nije dostupan u browser kontekstu.
- Env audit na Vercelu: VAPID, `CRON_SECRET`, Resend, Woo ključevi, `NEXT_PUBLIC_SHOP_REFILL_URL`; potvrdi eksterni scheduler setup.
- Offline page radi sa novim SW handlerima; bump SW. Lighthouse PWA + a11y; bez hardkodovanih hex boja van Tailwind configa.
- Ažuriraj CLAUDE.md (zatvori Fazu 1).

---

## Redosled i zavisnosti

`1.5` → `1.6` → `1.7` → `1.8` → `1.9` → `1.10` → `1.11` → `1.12` → `1.13` → `1.14` → `1.15` → `1.16`.
Paralelizabilno: 1.10 posle 1.5; 1.14 posle 1.8.

## Verifikacija (po koraku + finalno)

- Svaki korak ima "Gotovo kad" checklist iznad — prati ga pre prelaska na sledeći.
- Build kroz webpack (`--webpack`, ne Turbopack — Serwist injector; vidi memoriju).
- Finalno: kompletan E2E pass iz 1.16 + push test na realnom Android/iOS uređaju.

## Ključni postojeći fajlovi za reuse

- `lib/actions/safe-action.ts` (sve nove akcije), `lib/email/send.ts` (šablon za push send layer), `lib/protocol/dosing.ts`, `lib/access/status.ts`, `lib/validations/{protocol,supply}.ts` (već postoje, samo ih potrošiti), `app/sw.ts`, `app/onboarding/onboarding-wizard.tsx`, `vercel.json`, `lib/db/schema.ts` (šema je kompletna — **nema novih migracija u Fazi 1**).
