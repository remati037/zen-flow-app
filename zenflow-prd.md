# ZenFlow App — Product Requirements Document

**Brend:** NuroLab
**Verzija:** 1.0
**Platforma:** PWA · Next.js
**Obim:** MVP + Faza 2

> Companion aplikacija za ZenFlow™ protokol — dnevni habit tracker, alati za fokus i sistem koji čuva niz i podstiče ponovnu kupovinu.

> NuroLab — Mentalne performanse za ljude koji ne mogu da priušte sebi loš dan. — [nurolab.rs](https://nurolab.rs)

---

## 01 · Kontekst i cilj

NuroLab pravi dnevne protokole za mentalne performanse. Prvi proizvod je **ZenFlow™** — dnevni protokol od 8 klinički doziranih sastojaka za fokus, jasnoću i koncentraciju, bez kofeina i stimulansa.

> **Ključna brendska istina:** ZenFlow nije „pre i posle" proizvod — efekat se gradi iz dana u dan i nestaje kada se protokol prekine. Zato je dnevni protokol, a ne jednokratno rešenje.

Iz toga sledi uloga aplikacije: ona nije „dodatak", već **mašina za doslednost i zadržavanje korisnika**. Svaka funkcionalnost služi jednom od tri cilja:

1. **Doslednost protokola** — Da korisnik svaki dan popije obe doze.
2. **Doživljaj vrednosti** — Da vidi napredak i oseti da app vredi.
3. **Ponovna kupovina** — Da na vreme dokupi refill i ne prekine niz.

Svako ko kupi ZenFlow dobija pristup aplikaciji. Prvi kupci sa VIP liste čekanja koriste je besplatno dok su aktivni korisnici ZenFlow-a. U kasnijoj fazi, i oni koji nisu kupili moći će da se pretplate.

---

## 02 · Pitch (za korisnike)

### ZenFlow App — Tvoj protokol, na dohvat ruke.

ZenFlow ne radi na trikove. Radi tako što ga piješ svaki dan, a efekat se gradi — dozu po dozu, dan po dan. Problem je što je „svaki dan" teško održati. Tu ulazi aplikacija.

Svako jutro te podseti na jutarnju dozu. Uveče na drugu. Svaki ispoštovan dan produžava tvoj **niz** — i tvoju krivu fokusa. Vidiš koliko dana protokola imaš iza sebe, kako ti se kreću fokus i raspoloženje, i koliko ti je kapsula ostalo — pa te app obavesti da dokupiš pre nego što ostaneš bez zaliha i prekineš niz.

A između doza, tu su alati koji ti pomažu da iskoristiš taj fokus: Pomodoro tajmer za deep work blokove, vežbe disanja, i dnevni pregled napretka.

**Jedna aplikacija. Tvoj protokol, tvoj fokus, tvoj niz.**

> **Obavezan disklejmer:** ZenFlow je dnevni protokol za mentalne performanse i nije namenjen dijagnostikovanju, lečenju ili prevenciji bolesti. Praćenje fokusa i raspoloženja u aplikaciji je lično samoposmatranje, ne medicinska procena.

---

## 03 · Role i model pristupa

### Role

| Rola | Opis | Login |
|---|---|---|
| **Admin** | NuroLab tim. Pregled korisnika, porudžbina, metrika; slanje mejlova. | Clerk kredencijali |
| **Korisnik** | Krajnji korisnik ZenFlow-a. | Clerk, mejl porudžbine |

### Stanja korisnika (`access_status`)

| Stanje | Uslov | Pristup |
|---|---|---|
| **VIP** | Porudžbina u poslednjih 60 dana | Pun pristup, besplatno |
| **Inactive** | Nema porudžbinu u poslednjih 60 dana | Ograničen; poziv na dokup (F2: ponuda pretplate) |
| **Subscriber** `F2` | Plaća mesečnu članarinu (Stripe) | Pun pristup bez kupovine ZenFlow-a |

> **Verifikacija:** registracija je dozvoljena samo ako uneti mejl postoji među WooCommerce porudžbinama. `access_status` se računa automatski iz datuma poslednje porudžbine i osvežava pri svakom sync-u i periodičnim cron poslom.

---

## 04 · Funkcionalnosti

> Legenda: **MVP** prva verzija · **F2** faza dva

### 4.1 · Onboarding i profil

- **MVP** Registracija/login preko Clerk-a, mejlom korišćenim za porudžbinu.
- **MVP** Verifikacija porudžbine i dodela `access_status`.
- **MVP** Setup protokola: broj pakovanja + datum početka → izračun isteka zaliha (60 kapsula = 15 dana; 120 = 30 dana).
- **MVP** Podešavanje vremena doza i podsetnika (jutro / veče).
- **MVP** Focus Score kviz (baseline).
- **F2** Ciljevi za personalizaciju poruka i sadržaja.

### 4.2 · Jezgro: protokol tracker (habit tracker)

- **MVP** Dnevni check-in za 2 doze (jutro + veče), jedan tap.
- **MVP** Jutarnja notifikacija da se popuni dnevni unos.
- **MVP** **Niz (streak)** — uzastopni dani protokola. Centralni element ekrana.
- **MVP** Kalendar/heatmap doslednosti.
- **MVP** „Kriva fokusa" — vizuelizacija kumulativnih dana protokola.

### 4.3 · Zalihe i ponovna kupovina

- **MVP** Brojač preostalih kapsula i predviđanje datuma isteka.
- **MVP** **„Blizu si kraja" push + email** ~5 dana pre isteka, CTA na **refill** pakovanje.
- **MVP** One-tap re-order link na WooCommerce refill proizvod.
- **MVP** Framing „nemoj da prekineš niz" u poruci o zalihama.

### 4.4 · Alati za fokus

- **MVP** Pomodoro tajmer sa „deep work blok" pojmom (jutarnji blok vezan za jutarnju dozu).
- **MVP** „3 najvažnija zadatka danas" — lagana dnevna lista.
- **F2** Ambijentalni zvuci (brown/white noise, lo-fi).
- **F2** Fokus mod (DND podsetnik + sesija preko celog ekrana).

### 4.5 · Mentalno zdravlje / wellness

- **F2** Vežbe disanja (box breathing).
- **F2** Kratke vođene meditacije (2–10 min).
- **F2** Mood & energija check-in (jutro/veče).
- **F2** Mikro-journaling (beleške / zahvalnost).
- **F2** (Opciono) san i hidratacija.

### 4.6 · Uvidi i progres

- **MVP** Dashboard: dani protokola, doslednost %, trenutni niz, status zaliha.
- **F2** Focus Score kroz vreme (re-kviz na ~30 dana).
- **F2** Trend raspoloženja i fokusa.
- **F2** 30-dnevni izveštaj (na kraj punog protokola = trenutak za dokup).
- **F2** Soft korelacije (bez medicinskih tvrdnji).

### 4.7 · Edukacija i gamifikacija

- **F2** Mini biblioteka (protokol, sastojci, tehnike) + dnevni fokus-tip.
- **MVP** Osnovni bedževi: 7 dana, 15 dana (1 pakovanje), 30 dana (pun protokol).
- **F2** Prošireni milestone-ovi i bedževi.

### 4.8 · Admin panel

- **MVP** Login Clerk kredencijalima (admin rola).
- **MVP** Lista korisnika sa statusom, doslednošću i zalihama.
- **MVP** Pregled porudžbina i WooCommerce sync-a.
- **MVP** Ručno slanje/ponovno slanje „dokupi" mejla.
- **MVP** Osnovne metrike (aktivni korisnici, prosečna doslednost, pri kraju zaliha).
- **F2** Pregled pretplata (Stripe) i prihoda.

### 4.9 · Notifikacije

- **MVP** Jutarnja doza, večernja doza (podesivo vreme).
- **MVP** Niz u opasnosti (ako doza nije logovana do određenog sata).
- **MVP** Zalihe na izmaku (push + email, refill CTA).
- **MVP** Nedeljni rezime.
- **F2** 30-dnevni izveštaj (email).

---

## 05 · Ključni korisnički tokovi

### Registracija i aktivacija

1. Korisnik kupi ZenFlow na WooCommerce shopu.
2. WooCommerce webhook upiše porudžbinu u `orders`.
3. Korisnik se registruje preko Clerk-a istim mejlom.
4. App proverava mejl u `orders` → porudžbina u 60 dana = **VIP**.
5. Onboarding: setup protokola + Focus Score kviz + podsetnici.

### Dnevni protokol

1. Jutarnja notifikacija → „popio jutarnju dozu".
2. Niz raste, kriva fokusa se ažurira, zalihe opadaju.
3. Večernja notifikacija → druga doza.

### Ciklus zaliha i dokup

1. Cron računa preostale kapsule i datum isteka.
2. ~5 dana pre isteka → push + email „dokupi refill".
3. CTA → WooCommerce refill proizvod.
4. Nova porudžbina → VIP se obnavlja.

---

## 06 · Tech stack (finalno)

| Sloj | Izbor | Napomena |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript + React | — |
| Stilizovanje | Tailwind CSS | Brend tokeni u configu |
| UI komponente | shadcn/ui (Radix) | Prebojene u ZenFlow stil |
| PWA | Serwist | Service worker, manifest, install |
| Grafike | Recharts | Kriva fokusa, heatmap, dashboard |
| Auth | Clerk | Role preko metadata, admin middleware |
| Baza | Postgres (Neon) | — |
| ORM | Drizzle | — |
| Email | Resend | Dokup, izveštaji |
| Push | Web Push (VAPID) | iOS samo za instaliranu PWA (16.4+) |
| Scheduler | Vercel Cron | Dnevne/nedeljne provere |
| Plaćanje (F2) | Stripe (preko US firme) | Pretplata za ne-kupce |
| Hosting | Vercel + Neon | app.nurolab.rs |
| Analitika (opc.) | PostHog / Plausible | Retencija / funnels |

> **Autorizacija uz Clerk:** `role` (admin/user) u Clerk metadata, gating admin ruta preko middleware-a. `access_status` u Postgres-u (menja se vremenski); proverava se u server akcijama / API rutama.

---

## 07 · Model podataka (MVP)

```
profiles
  id (clerk_user_id, pk), email, name, role, access_status,
  protocol_start_date, dose_morning_time, dose_evening_time,
  focus_score_baseline, onboarding_completed, created_at

orders
  id (pk), woo_order_id, email, product_type (full|refill),
  quantity_packages, capsules_total, order_date, status, synced_at

protocol_logs
  id (pk), user_id (fk), date, dose (morning|evening), taken_at, status

supply (ili izračunato u letu)
  user_id (fk), capsules_remaining, estimated_runout_date, updated_at

focus_sessions (pomodoro)
  id (pk), user_id (fk), started_at, duration_min, completed, task_label

daily_tasks
  id (pk), user_id (fk), date, title, done

badges
  id (pk), user_id (fk), badge_key, earned_at

push_subscriptions
  id (pk), user_id (fk), endpoint, p256dh, auth

notifications_log
  id (pk), user_id (fk), type, channel (push|email), sent_at, status

focus_quiz_results
  id (pk), user_id (fk), date, score, answers (json)
```

> **Faza 2 dodaci:** `mood_checkins`, `journal_entries`, `subscriptions` (Stripe), `content_items` (edukacija).

---

## 08 · Integracije

### WooCommerce
Webhook `order.created` / `order.completed` → API ruta → upsert u `orders` + osvežavanje `access_status`. REST API za backfill i admin sync. Mapiranje `full` vs `refill` po SKU/ID.

### Clerk
Email registracija; webhook `user.created` kreira `profiles` red i pokreće verifikaciju porudžbine.

### Resend
Šabloni: dobrodošlica, zalihe na izmaku (dokup), nedeljni rezime, 30-dnevni izveštaj (F2). Svi u ZenFlow stilu.

### Web Push & Stripe (F2)
VAPID ključevi i slanje preko Vercel Cron-a. Stripe checkout + pretplata za `subscriber` stanje (Faza 2).

---

## 09 · Dizajn sistem (brending)

**Princip:** clean i premium. Paper pozadina, bele kartice sa mekim senkama i suptilnim borderima, lime kao jedini jak akcenat, dosta „vazduha", zaobljeni radijusi.

### Boje

| Token | Vrednost | Uloga |
|---|---|---|
| `--paper` | `#ECF0F3` | pozadina |
| `--white` | `#FFFFFF` | kartice |
| `--ink` | `#203849` | tekst / tamna dugmad |
| `--slate` | `#304F60` | |
| `--slate-mid` | `#445662` | sekundarni tekst |
| `--slate-soft` | `#597080` | eyebrow |
| `--lime` | `#DEFE9C` | akcenat / CTA |
| `--lime-deep` | `#DCF39E` | |
| `--lime-soft` | `#F0FFD0` | |
| `--mint` | `#D3FBD8` | |
| `--line` | `rgba(32,56,73,.12)` | |
| `--line-strong` | `rgba(32,56,73,.2)` | |

### Tipografija & forme

- **Font:** Hanken Grotesk (300–700).
- **Naslovi:** weight 500, letter-spacing −.03em, line-height ~1.06.
- **Eyebrow:** uppercase, tracking .14em, slate-soft, linija ispred.
- **Body:** line-height 1.55.

```
--radius:       20px / 28px
--shadow-soft:  0 6px 30px rgba(32,56,73,.08)
--shadow-lift:  0 18px 60px rgba(32,56,73,.16)
--ease:         cubic-bezier(.22,1,.36,1)
```

Dugmad (pill 999px): `btn-dark` ink/paper · `btn-lime` lime/ink · `btn-ghost` border.

### Tailwind mapiranje (skica)

```js
theme.extend = {
  colors: {
    paper:'#ECF0F3', ink:'#203849', slate:'#304F60',
    'slate-mid':'#445662', 'slate-soft':'#597080',
    lime:'#DEFE9C', 'lime-deep':'#DCF39E', 'lime-soft':'#F0FFD0', mint:'#D3FBD8'
  },
  borderRadius: { DEFAULT:'20px', lg:'28px' },
  fontFamily: { sans:['"Hanken Grotesk"','sans-serif'] },
  boxShadow: {
    soft:'0 6px 30px rgba(32,56,73,.08)',
    lift:'0 18px 60px rgba(32,56,73,.16)'
  },
}
```

---

## 10 · Koraci izrade (roadmap)

### Faza 0 — Postavka

1. Next.js + TypeScript + Tailwind; ubačeni brend tokeni i Hanken Grotesk.
2. shadcn/ui i prebojavanje u ZenFlow stil.
3. Clerk (login, role, admin middleware).
4. Neon Postgres + Drizzle (šeme iz sekcije 7).
5. Vercel deploy + Resend + Serwist PWA shell.

### Faza 1 — MVP

1. WooCommerce webhook + backfill → `orders`; logika `access_status` (60 dana).
2. Registracija + verifikacija porudžbine; kreiranje `profiles`.
3. Onboarding: setup protokola + Focus Score kviz + podsetnici.
4. Protokol tracker: check-in, niz, heatmap, kriva fokusa.
5. Zalihe: brojač + predviđanje isteka.
6. Notifikacije: Web Push + Resend; Vercel Cron (doza, niz, zalihe, rezime); „dokupi refill".
7. Pomodoro tajmer + „3 zadatka danas".
8. Dashboard + osnovni bedževi.
9. Admin panel (korisnici, porudžbine, metrike, ručni mejl).
10. PWA poliranje (offline, install) + QA.

### Faza 2

1. Wellness: disanje, meditacije, mood check-in, journaling.
2. Edukacija (biblioteka + dnevni tip) i prošireni bedževi.
3. Napredni uvidi: Focus Score trend, korelacije, 30-dnevni izveštaj.
4. Stripe pretplata za ne-kupce (`subscriber`).
5. Ambijentalni zvuci, fokus mod, ciljevi.

---

## 11 · Nefunkcionalni zahtevi

### PWA
Instalabilna, offline shell, brzo učitavanje. iOS push samo za PWA na home screen-u (16.4+) — zato je „dokupi" poruka uvek i mejl.

### Bezbednost
Autorizacija na svakoj API ruti (Clerk sesija + provera `access_status`/role). Admin rute zaštićene middleware-om.

### Privatnost (GDPR/ZZPL)
Minimalno prikupljanje, politika privatnosti, brisanje naloga i izvoz podataka. Mood/fokus podaci osetljivi — eksplicitan pristanak.

### Performanse & disklejmer
Cilj LCP < 2.5s na mobilnom. Zdravstveni disklejmer u onboarding-u i uvidima, bez medicinskih tvrdnji.

---

## 12 · Otvorene stavke za kasnije

- Stripe isplate preko US firme — računovodstveni/poreski deo pre Faze 2.
- Sadržaj edukativne biblioteke i meditacija (snimci/tekst).
- Politika kad VIP padne u `inactive` usred niza — predlog: niz se „pauzira" a ne briše (dodatni motivator za dokup).
- Lokalni RSD gejtvej kao alternativa Stripe-u, ako se javi potreba za lokalnom naplatom.

---

*NuroLab · ZenFlow App — Product Requirements Document · v1.0*
