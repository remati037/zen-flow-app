# Audit roadmap — avgust 2026

> Kompaktna checklist verzija kompletnog audita (5 nezavisnih prolaza: bezbednost, domenska
> logika, push/cron/email/Woo, UI/UX/PWA, admin/data sloj). Pun dokument sa obrazloženjima i
> attack/failure scenarijima: artifact „ZenFlow Audit" (claude.ai/code/artifacts).
> Štikliraj po završetku; svaki sprint se završava zelenim `qa-dates` + `qa-routes` + build.

## Sprint 1 — Novac i core mehanika (~2–3 dana)

- [ ] **K2** `topUpSupplyForEmail` poredi mejl case-sensitively → top-up tiho preskočen.
      Fix: `where(sql`lower(${profiles.email}) = ${email}`)`. `lib/woocommerce/sync.ts:34`
- [ ] **K1** Woo datumi se parsiraju iz `date_paid`/`date_created` (lokalna zona bez offseta →
      Node ih čita kao UTC; večernje porudžbine padaju u sledeći dan). Fix: `date_paid_gmt ||
      date_created_gmt` + `Z` sufiks, ažuriraj `wooOrderSchema`. `lib/woocommerce/sync.ts:121`
- [ ] **K3** Supply matematika je read-modify-write: double-tap → −4 za jednu dozu; clamp
      asimetrija „kuje" kapsule (1 → check-in → 0 → undo → 2); top-up vs check-in lost update.
      Fix: SQL delta `greatest(0, capsules_remaining + delta)` + prev iz upserta (CTE/RETURNING);
      undo vraća samo stvarno potrošeno. `app/(app)/protokol/actions.ts:31-81`
- [ ] **K4** Insert-vs-update TOCTOU u `upsertOrder` → dupli top-up na Woo retry.
      Fix: `.onConflictDoUpdate(...).returning({ inserted: sql`(xmax = 0)` })`, top-up samo na
      pravi insert. `lib/woocommerce/sync.ts:135-161`
- [ ] **K5** Refund/cancel se odbacuje pre upserta → kupac zadrži VIP + kapsule 60 dana.
      Fix: za postojeći `wooOrderId` sa opozvanim statusom ažuriraj status reda, filtriraj
      sinhronizovane statuse u `getLatestOrderDate`/`maintainAccessStatuses`, pozovi refresh.
      Odluči (dokumentuj): kapsule se ne oduzimaju. `lib/woocommerce/sync.ts:99-101`
- [ ] **K6** Streak coverage prozor (61 kalendarski dan, inkluzivno) ≠ VIP prozor (60×86400s
      ms-aritmetika) → poslednji pokriveni dan resetuje streak umesto freeze. Fix: oba prozora
      na kalendarski dan po Beogradu; QA slučaj za granicu. `lib/protocol/streak.ts:45`,
      `lib/access/status.ts:34,137`
- [ ] **V1** Migracija sa 3 indeksa (bez izmena koda; ovo je „eksplicitna potreba" iz CLAUDE.md):
      `orders (lower(email), order_date DESC)`, parcijalni `protocol_logs (date) WHERE
      status='taken'`, `notifications_log (sent_at)`
- [ ] **V5** `completeOnboarding` je replayable (resetuje zalihe na packages×60, dupli quiz red,
      pomera protocolStartDate). Fix: early-return na `onboardingCompleted`; bound `startDate`
      na `[danas−60, danas]`. `app/onboarding/actions.ts:21-66`

## Sprint 2 — Pouzdanost isporuke i pristupa (~2–3 dana)

- [ ] **K7** Paywall je samo layout redirect — inactive korisnik zove sve server akcije.
      Fix: `requireActiveAccess` u `createAction` (default za `(app)`, admin izuzet).
      `lib/actions/safe-action.ts:37-49`
- [ ] **K8** Nema `pushsubscriptionchange` handlera → posle rotacije endpointa korisnik trajno
      tiho gubi push. Fix: handler u SW (resubscribe + POST) + re-upsert subscription na app
      load. `app/sw.ts:45-89`
- [ ] **V3** Dispatcher: per-user try/catch (jedan throw obara batch kod streak-risk petlje),
      chunked `Promise.allSettled`, `{timeout: 5000}` na web-push, `export const maxDuration`.
      Isto za low-stock rutu. `app/api/cron/notifications/route.ts:116-149`
- [ ] **V4** GH Actions jitter može da pojede 30-min prozor → `NOTIFICATION_WINDOW_MIN=45`
      (dnevni dedup već sprečava duplikate) + beleži rupe > prozora u diagnose ruti
      (koja sad hardkodira `+ 30` i laže kad je env postavljen — koristi `WINDOW_MIN`)
- [ ] **V6** Admin access override se poništava na *sledeći page load korisnika* (ne noćnim
      cronom, kako copy tvrdi) — u oba smera. Fix: `access_override` kolona koju
      `resolveAccessStatus`/`maintainAccessStatuses` poštuju; minimalno ispravan copy +
      upozorenje i za inactive smer (`hasOrderInVipWindow` već postoji na AdminUserRow)
- [ ] **V10** Email opt-out ne postoji; low-stock mejl na 3 dana zauvek. Fix: `email_alerts`
      preferenca, `List-Unsubscribe` header, cap (max 3 po epizodi, reset na top-up)
- [ ] **V11a** Clerk `user.created` retry preskače refresh+welcome (onConflictDoNothing) →
      welcome mejl izgubljen. Fix: na conflict putu ipak refresh + welcome uz idempotency kroz
      `notifications_log` (`type='welcome'`). `app/api/webhooks/clerk/route.ts:44-75`
- [ ] **V11b** VAPID rotacija: `subscribeToPush` reuse-uje subscription starog ključa → 403
      zauvek. Fix: poredi `existing.options.applicationServerKey`, na mismatch unsubscribe +
      fresh. `lib/push/client.ts:52-58`
- [ ] **S12** Dedup je check-then-act → unique indeks (user, type, beogradski dan) + insert pre
      slanja sa skip-on-conflict (ili dokumentuj trade-off duplikat>izgubljen)
- [ ] **S13** Timing-safe compare za cron secrete (3 rute); allowlist push servisa za
      `endpoint` u zod šemi (blind SSRF primitiv); escape `%_` + zagrade u admin LIKE pretrazi

## Sprint 3 — Dnevni UX temelji (~2–3 dana)

- [ ] **V7** Nula loading/error stanja: `app/(app)/loading.tsx` (Skeleton postoji, neiskorišćen),
      `app/(app)/error.tsx` + root `global-error.tsx`
- [ ] **V8** `pt-[env(safe-area-inset-top)]` na sticky headere (iOS PWA sudar sa statusbarom).
      `components/app-shell/app-header.tsx:15`, `app/(admin)/admin/layout.tsx:38`
- [ ] **V9** `DoseCheckin` prop resync (desync posle WeekStrip backfill-a današnjeg dana) —
      kopiraj šablon iz `daily-tasks.tsx:24-28`. `components/protocol/dose-checkin.tsx:53`
- [ ] **S1** Ćirilica u onboardingu: `toLocaleDateString('sr-RS')` → `formatIsoDateSr`
      (rešava i UTC-parse pomak dana). `app/onboarding/onboarding-wizard.tsx:49-53`
- [ ] **S2** 44px CTA: dodaj `xl` button size (h-11/h-12 pill, po `.btn-*` iz globals.css);
      per-dose pending umesto zajedničkog `isPending` u DoseCheckin
- [ ] **S3** Non-text kontrast lime 1.1:1: `ring-1 ring-ink/20` na fill-ove, check glyph u
      complete tačkama, `aria-label` po danu u WeekStrip + caption „Dodirni dan da ispraviš"
- [ ] **S4** sessionStorage persistencija onboarding wizarda (refresh gubi svih 8 odgovora)
- [ ] **S5** „Proveri ponovo" dugme na `/nemas-pristup` (standalone PWA nema reload UI);
      „Pokušaj ponovo" na `~offline`
- [ ] **S9** Stale `today` prop preko ponoći: `visibilitychange` → `router.refresh()` u shellu

## Sprint 4 — Admin, perf i polish (kontinuirano)

- [ ] **V2** averageStreak vuče sve logove svih korisnika na svako otvaranje admina (cliff na
      ~300–500 korisnika) → računaj u noćnom cronu / `current_streak` kolona; isključi admine
      iz proseka (`alwaysCovered` ga naduvava)
- [ ] **S10** Pretraga porudžbina u adminu (limit 100 bez pretrage — istorija nevidljiva)
- [ ] **S11** Backfill server-side lock (flag red + 409; advisory lock ne radi preko neon-http)
- [ ] **S6** Recharts lazy na dashboardu (~100 kB gz eager) ili čist CSS bar row
- [ ] **S7** `addTask` atomski limit: `INSERT … WHERE (SELECT count(*) …) < 3`
- [ ] **S8** Fokus: obriši localStorage ključ sinhrono pre `persistSession` (dupli persist iz 2
      taba); šalji client `startedAt` validiran ≤ now
- [ ] **N1** Copy: ti-forma u `safe-action.ts` greškama; `pluralSr` u fokus stranici i
      mini-kartici; lokalizovan iOS hint („Deli (Share)"); `lang="sr-Latn"`
- [ ] **N2** Dizajn: `--color-warn` token umesto `amber-*`; ujednači card sisteme (shadow-soft
      na shadcn Card); `MotionConfig reducedMotion="user"`; focus-visible na hand-rolled dugmad
- [ ] **N3** Logika: `logDose` odbij dane pre `protocolStartDate`/zamrznute (troše kapsule, ne
      ulaze u streak); dokumentuj `mergeCoveredRanges` 1-day-gap i DST 02:xx prihvaćene rupe
- [ ] **N4** Higijena: pruning `notifications_log` (90d); `EMAIL_FROM` blocker u diagnose/throw
      u produkciji; `console.warn` za nevalidan Woo payload; `unsubscribeFromPush` proveri
      rezultat; timeout na `serviceWorker.ready`
- [ ] **N5** QA proširenja: parametrizovan `WINDOW_MIN >= cadence` umesto `=== 30`; granica
      coverage/VIP prozora; ponoć-tačno `belgradeTimeHM`

## Faza 2 napomene

- **Transakcije strukturno ne postoje** — `neon-http` drajver baca na `db.transaction()`.
  Pre Stripe integracije: `neon-serverless` (WebSocket Pool) za write puteve koji traže
  atomičnost, ili single-statement CTE-ovi. Ne pretpostavljaj da transakcije rade.
- **Migracija za Fazu 2** (jedna, zajedno sa Stripe kolonama): `access_override`,
  `email_alerts`, eventualno `current_streak`.
- **Scheduler**: prošireni prozor (V4) je dovoljan sada; plaćeni cron čim korisnici porastu —
  pouzdanost podsetnika je retencioni motor.
- **Skaling pragovi**: ~300–500 aktivnih → admin dashboard (V2); ~10k porudžbina → svaki page
  load bez V1 indeksa; >100 porudžbina → već sada nevidljiva istorija u adminu (S10).
