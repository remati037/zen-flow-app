# Faza 1 — QA izveštaj (Korak 1.16)

Audit koda naspram „Gotovo kad" checkliste koraka 1.5–1.15, timezone matrica, PWA/offline
provera, env audit i a11y/dizajn pass. Bez novih feature-a — samo verifikacija, popravke i
dokumentacija.

## 1. Audit naspram „Gotovo kad"

| Korak | Kriterijum | Rezultat |
|---|---|---|
| 1.5 temelji | build, onboarding, SKU warning, grep čist, docs u `/docs` | ✅ prolazi |
| 1.6 protokol + streak | idempotentan check-in, undo vraća kapsule, streak uz inactive gap, datumi u 00:30 | ⚠️ delimično — sve osim streak pauze (**N1**) |
| 1.7 zalihe + top-up | check-in smanjuje, Woo top-up tačno jednom, backfill ne dira | ✅ prolazi |
| 1.8 Web Push infra | subscribe, test push, klik otvara rutu, unsubscribe, stale cleanup | ✅ kod / ⛔ uređaj (E2E) |
| 1.9 dispatcher | reminder jednom, streak-at-risk, low-stock oba kanala, ništa `inactive` | ⚠️ delimično — mrtva zona (**N4**) |
| 1.10 Fokus | sesija u DB, refresh nastavlja, 4. task odbijen server-side, reset po danu | ✅ prolazi |
| 1.11 Bedževi | `niz-3` jednom, toast + confetti, onboarding bedž | ✅ prolazi |
| 1.12 Dashboard | jedan mobilni ekran, check-in bez navigacije, bez client fetch-a | ✅ prolazi |
| 1.13 Onboarding | flow, auto-advance, gauge, varijabilni bulleti, confetti, back | ✅ kod / ⛔ vizuelno (E2E) |
| 1.14 Podešavanja | save ažurira DB i reminder vremena, push round-trip, validacija | ✅ prolazi |
| 1.15 Admin | live lista sa streak-ovima, override, orders, backfill iz UI | ✅ prolazi |

Nema preostalih „Uskoro" stubova ni `TODO`/`FIXME` u `app/`, `lib/`, `components/`.

## 2. Timezone matrica

`scripts/qa-dates.mts` — 47 provera čistih funkcija pod **zamrznutim satom** (globalni `Date`
se zamenjuje na fiksni UTC instant, pa se moduli učitavaju dinamički). Pokretanje:

```bash
npx tsx scripts/qa-dates.mts
```

Pokriveno: `belgradeToday` / `belgradeTimeHM` / `belgradeDayStart` u **23:50 i 00:10** (zima
UTC+1 **i** leto UTC+2), granica dedup-a se pomera tačno 24h preko ponoći, oba **DST prelaza**
(29.03.2026 napred, 25.10.2026 nazad), `addDaysIso` / `daysBetweenIso` preko DST-a i prestupnog
dana, `toBelgradeIso` za `orders.orderDate` oko ponoći, `hmToMinutes` za Postgres `time`, te
streak grace/reset/pauza scenariji.

Grep je čist: **nijedno** pojavljivanje `toISOString()` ni `slice(0, 10)` u `app/`, `lib/`,
`components/`.

## 3. Nalazi

### N1 — Streak „pauza" je funkcionalno mrtva (OTVORENO, nije popravljeno)

Algoritam u `lib/protocol/streak.ts` radi tačno kako je specificiran, ali specifikacija se ne
poklapa sa realnošću: pokrivenost traje **60 dana** od porudžbine, a jedno pakovanje (60 kapsula,
4/dan) traje **15 dana**. Dani 16–60 su „pokriven + nekompletan" → niz se resetuje na 0 već 16.
dana, mnogo pre nego što `frozen` zona uopšte počne.

```
1 pakovanje 01.01, savršena doslednost 15 dana:
  today=2026-01-15 → current: 15
  today=2026-01-17 → current: 0     ← niz mrtav dok je korisnik i dalje VIP
  dokup 05.03 + 5 dana doslednosti → current: 5   (a ne 20)
```

Pauza pomogne samo ako je korisnik čekirao **poslednji pokriveni dan pre rupe i prvi dan nove
porudžbine** — u praksi skoro nikad (porudžbina se plaća danas, paket stiže za par dana).

**Nije dirano** — popravka bi vezala zamrzavanje za **iscrpljene zalihe** umesto za porudžbinu,
što je promena proizvodne semantike, van opsega 1.16. Odluka je na vlasniku proizvoda.

### N2 — Offline stranica se nikad nije servirala (POPRAVLJENO)

`/~offline` **nije bio** u precache manifestu (73 unosa, nijedan `/~offline`). Serwist fallback
zove `matchPrecache('/~offline')`, koji bez precache ključa vraća `undefined` → fallback ne opali
i korisnik dobije browser-ov offline ekran. Uzrok: manifest pokriva `.next/static` + `public/`, a
`/~offline` je server-renderovana ruta.

Popravka u `next.config.ts` kroz **`manifestTransforms`** (dodaje unos na postojeći manifest).
Prva verzija je koristila `additionalPrecacheEntries` — ta opcija u `@serwist/next` **zamenjuje**
glob nad `public/`, pa je izbacila sve ikone iz precache-a (74 → 10 unosa); vraćeno.
`SW_VERSION` (`1.16.0`) je `revision` tog unosa — bumpuj ga kad se offline stranica menja.

`push` i `notificationclick` handleri iz 1.8 su potvrđeni u build-ovanom `public/sw.js`.

### N3 — `belgradeDayStart()` grešio ±1h na DST dane (POPRAVLJENO)

Oduzimanje `H*3600 + M*60` od `now` ne važi na dan kad dan nema 24h:

- 29.03. (proleće): vraćao `28.03 22:00Z`, prava ponoć je `23:00Z` → dedup prozor curi 1h u
  prethodni dan (može da uguši legitimnu notifikaciju).
- 25.10. (jesen): vraćao `24.10 23:00Z`, prava je `22:00Z` → propušta prvi sat dana (mogući duplikat).

Zamenjeno računanjem ponoći iz `belgradeToday()` + korekcijom offsetom zone u dva prolaza
(drugi prolaz hvata slučaj kad prvi offset padne sa pogrešne strane prelaza).

### N4 — streak-at-risk se nikad nije slao za večernju dozu ≥ 22:30 (POPRAVLJENO)

`riskStart = max(21:00, veče + 90min)`; za 22:30 → 1440 min, a `nowMin` ne prelazi 1439 → prozor
nikad ne opali. Dodat clamp na `LAST_RISK_WINDOW_START_MIN` (23:30), da ceo prozor stane pre ponoći.

### N5 — `.env.example` bez `NEXT_PUBLIC_SHOP_REFILL_URL` (POPRAVLJENO)

Kod ga čita na tri mesta (`/zalihe`, `/dashboard`, `/podesavanja`); postojao je u `.env.local`, pa
lokalno radi — na Vercelu bi refill CTA tiho nestao. Dodat u `.env.example` + kompletna launch
lista svih 21 varijable u README.

### N6 — iOS install hint (DODATO)

`components/push/ios-install-hint.tsx` — banner sa uputstvom „Dodaj na početni ekran" kad je iOS,
van instaliranog PWA, i `Notification` nije dostupan. Renderuje se u Podešavanjima (kartica
Notifikacije) i u onboarding koraku za notifikacije. Detekcija kroz `useSyncExternalStore`
(server snapshot `false`) da hidracija prođe čisto. `PushToggle` više ne duplira iOS poruku.

### N7 — `public/sw.js` se lintovao (POPRAVLJENO)

Generisani SW (gitignored, ali ne eslint-ignored) davao je 88 warninga + 1 error. Dodat u
`globalIgnores` u `eslint.config.mjs`. Lint je sad: **0 errors**, 1 pre-postojeći warning u
`scripts/generate-icons.ts`.

### N8 — kontrast `text-muted-foreground` na `bg-muted` = 4.20 (POPRAVLJENO)

Pada AA za normalan tekst (`components/push/push-toggle.tsx`). Prebačeno na `text-slate-mid` / `text-ink`.

### N9 — dizajn: hex je čist (BEZ IZMENA)

Nijedna hardkodovana hex boja u app komponentama. Jedina pojavljivanja su legitimna: `app/manifest.ts`,
Clerk `appearance` u `app/layout.tsx`, `app/style-guide/page.tsx` (swatch-evi), `lib/email/templates/*`
(email klijenti nemaju Tailwind), `lib/confetti.ts` (canvas lib traži hex).

Kontrast brend tokena (WCAG AA):

| Kombinacija | Ratio | AA |
|---|---|---|
| `ink` na `lime` | 10.89 | ✅ |
| `ink` na `lime-soft` | 11.56 | ✅ |
| `ink` na `mint` | 10.77 | ✅ |
| `ink` na `paper` | 10.63 | ✅ |
| `slate-mid` na `white` | 7.63 | ✅ |
| `slate-soft` na `paper` | 4.52 | ✅ |
| `slate-soft` na `lime` | 4.63 | ✅ |

A11y: icon-only kontrole imaju `aria-label` (`app-header`, `daily-tasks`, `badge-toast`,
`user-search`, `push-toggle`), gauge ima `role="img"` + label, preset dugmad koriste `aria-pressed`,
fokus stanja dolaze iz shadcn `focus-visible:ring` + globalnog `outline-ring/50`.

### N10 — otkazana / refundirana porudžbina ne vraća kapsule (DOKUMENTOVANO)

`cancelled` / `refunded` padaju u `skipped: status`, red u `orders` ostaje sa starim statusom, a
top-up-ovane kapsule ostaju korisniku. Upisano u README → Poznata ograničenja.

## 4. Stanje pred launch

```
npm run build            → ✅ prolazi (webpack, 26 stranica)
npm run lint             → ✅ 0 errors
npx tsx scripts/qa-dates.mts → ✅ 47/47
```

Preostaje **ručni E2E pass na realnom uređaju** (Android Chrome + iOS instaliran PWA) — checklista ispod.

## 5. E2E ručni pass — checklista

```markdown
## Faza 1 — E2E launch pass

### Registracija i verifikacija pristupa
- [ ] Nov korisnik se registruje preko Clerk-a mejlom koji NEMA porudžbinu → redirect na `/nemas-pristup`
- [ ] Ekran `/nemas-pristup` prikazuje CTA ka shopu, kontakt mejl i odjavu
- [ ] Napravi Woo porudžbinu (SKU `NURO-001`) na taj isti mejl → webhook stigne
- [ ] Refresh app-a → korisnik je `vip`, pušta ga na `/onboarding`
- [ ] Welcome mejl je stigao (Resend)
- [ ] Porudžbina sa nepoznatim SKU → u logovima stoji `[woo-sync] ... nijedan poznat ZenFlow SKU`

### Onboarding
- [ ] 3 story slajda prolaze, „preskoči" radi
- [ ] Broj pakovanja je prefilovan iz porudžbine
- [ ] Vremena doza se biraju i čuvaju
- [ ] Kviz ide jedno pitanje po ekranu, auto-advance posle izbora, `Nazad` radi na svakom koraku
- [ ] Focus Score gauge animira do tačnog skora, plan ima 2–3 bulleta
- [ ] Push toggle traži dozvolu i UPISUJE pretplatu (proveri `push_subscriptions` u bazi)
- [ ] Celebracija: confetti + bedž `protokol-zapocet`
- [ ] Ceo flow < 2 min

### Check-in i streak
- [ ] `/protokol`: obe doze se čekiraju, toast se pojavi
- [ ] Ponovni klik na istu dozu ne duplira log i ne menja zalihe
- [ ] Undo (taken → skipped) vraća 2 kapsule
- [ ] Zalihe padaju za 4 kapsule po kompletnom danu
- [ ] Streak brojač raste, 7-dnevni strip prikazuje complete/partial/missed
- [ ] Check-in za juče radi; za pre 8 dana je odbijen
- [ ] **Check-in u 23:50 pada na današnji dan, u 00:10 na sutrašnji** (proveri `protocol_logs.date`)
- [ ] Check-in sa `/dashboard` ažurira streak bez navigacije
- [ ] Na 3. uzastopnom danu stiže bedž `niz-3` (tačno jednom)

### Notifikacije
- [ ] Postavi jutarnju dozu par minuta unapred → dispatcher pošalje push tačno jednom
- [ ] Ručni replay `curl` u istom danu → dedup blokira (brojač 0)
- [ ] Klik na notifikaciju otvara `/protokol` (i fokusira postojeći tab ako je otvoren)
- [ ] Streak-at-risk stiže uveče kad je dan nekompletan i streak ≥ 1
- [ ] Spusti zalihe ≤ 14 → `/api/cron/low-stock` šalje **email I push**
- [ ] Ponovni poziv u roku od 3 dana → oba kanala blokirana
- [ ] `inactive` korisnik ne dobija ništa
- [ ] Isključi push toggle → red nestaje iz `push_subscriptions`

### Refill i zalihe
- [ ] Refill CTA vodi na `NEXT_PUBLIC_SHOP_REFILL_URL`
- [ ] Nova Woo porudžbina (`NURO-002`) top-upuje zalihe **tačno jednom**
- [ ] Replay istog webhook-a NE duplira kapsule
- [ ] Admin backfill NE menja zalihe
- [ ] Ručna korekcija kapsula u dijalogu radi, runout datum se preračuna

### Pomodoro i zadaci
- [ ] Preset 25/5 i 50/10 se biraju
- [ ] Refresh usred sesije NASTAVLJA odbrojavanje
- [ ] Prebacivanje u drugi tab na 5 min → povratak pokazuje TAČNO preostalo vreme
- [ ] Kraj bloka: beep + treptanje naslova taba + toast
- [ ] Sesija je u `focus_sessions` sa tačnim trajanjem; prekinuta ima `completed: false`
- [ ] Dodaj 3 zadatka; 4. je odbijen sa jasnom porukom
- [ ] Sutradan su zadaci prazni (bez cron-a)
- [ ] Prva završena sesija dodeljuje `prvi-fokus`

### Bedževi
- [ ] `/bedzevi`: osvojeni u boji sa datumom, neosvojeni grayscale + katanac
- [ ] Toast + confetti se okinu na dodelu
- [ ] Ponovna akcija na istom pragu NE duplira bedž

### Admin panel
- [ ] `/admin` metrike se poklapaju sa bazom
- [ ] Grafikon dnevnih check-inova (14d) crta podatke
- [ ] `/admin/korisnici`: pretraga po mejlu radi server-side
- [ ] Streak i kapsule u tabeli se poklapaju sa korisničkim ekranom
- [ ] Access override (vip / inactive) radi; dijalog objašnjava da noćni cron vraća ručni `vip`
- [ ] „Pošalji welcome ponovo" stvarno pošalje mejl
- [ ] `/admin/porudzbine` se poklapa sa Woo podacima; backfill se pokreće iz UI-ja
- [ ] Ne-admin na `/admin` → redirect na `/dashboard`

### PWA (realan uređaj)
- [ ] **Android Chrome:** instalacija radi, test push stiže, klik otvara ciljnu rutu
- [ ] **iOS Safari (NEinstaliran):** banner „Dodaj na početni ekran" je vidljiv
- [ ] **iOS instaliran PWA:** banner NESTAJE, push toggle radi, test push stiže
- [ ] Ugasi mrežu → navigacija prikazuje ZenFlow offline ekran (ne browser-ov)
- [ ] Ikone i splash izgledaju ispravno na oba OS-a
```
