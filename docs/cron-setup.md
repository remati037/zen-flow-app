# Cron / scheduler setup

Aplikacija ima dve vrste zakazanih poslova:

## 1. Dnevni Vercel Cron-ovi (`vercel.json`)

Idu automatski preko Vercela (schedule u **UTC**):

| Ruta | Raspored (UTC) | Šta radi |
|---|---|---|
| `/api/cron/low-stock` | `0 8 * * *` | Low-stock alert na **email + push** (dedup 3 dana, nezavisno po kanalu) |
| `/api/cron/refresh-access` | `0 3 * * *` | Osvežava `access_status` (VIP prozor) |

Ne zahtevaju ručno podešavanje — dovoljno je da je `CRON_SECRET` postavljen na Vercelu; Vercel Cron šalje `Authorization: Bearer <CRON_SECRET>` automatski.

## 2. Notification dispatcher — eksterni scheduler (cron-job.org)

`/api/cron/notifications` mora da se poziva **na 15 min** (vremena doza su individualna, pa reminderi ne mogu na fiksni dnevni cron). Ova ruta **NIJE** u `vercel.json` — Vercel Cron na Hobby planu vozi samo dnevne rasporede, pa je vozi eksterni scheduler.

Dva načina; oba rade. **GitHub Actions je već podešen u repou** — treba samo secret.

### A) GitHub Actions (preporučeno — nema trećeg naloga)

Workflow je u [`.github/workflows/notifications-dispatcher.yml`](../.github/workflows/notifications-dispatcher.yml).
Repo je public, pa su Actions minuti besplatni i neograničeni.

1. **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `CRON_SECRET`
   - Value: **ista vrednost** kao `CRON_SECRET` na Vercelu
2. (Opciono) **Variables → New variable**: `APP_URL`, ako domen nije `https://app.nurolab.rs`.
3. Test odmah: **Actions → „Notification dispatcher" → Run workflow**. Zeleno + `HTTP 200` u logu = radi.

Workflow puca sa jasnom porukom na `401` (secret se ne poklapa) i na redirect (pogrešan `APP_URL`),
pa neuspeh ne prođe tiho.

**Tri zamke GitHub cron-a — pročitaj pre nego što se osloniš na njega:**

1. **Prvi zakazani run ne kreće odmah.** Pošto workflow sleti na default granu, GitHub-u treba
   vremena da aktivira raspored — obično 10–30 min, ponekad i duže. Dotle radi samo „Run workflow".
   Provera da li je raspored proradio:
   ```bash
   gh run list --workflow="Notification dispatcher" --limit 20
   ```
   Ako u koloni event nema nijedan `schedule`, raspored još nije aktivan.
2. **Raspored nije precizan.** GitHub izričito navodi da `schedule` kasni pod opterećenjem, najviše
   na pun sat. Kašnjenja od 10–20 min su normalna, a pod velikim opterećenjem run zna i da se
   **preskoči**. Prozor podsetnika je 30 min a pozivi na 15, pa umereno kašnjenje ne gubi
   notifikaciju — ali ako ti treba pouzdano, uzmi **cron-job.org** (opcija B).
3. **GitHub gasi zakazane workflow-e posle 60 dana neaktivnosti repoa.** Za projekat u razvoju nije
   problem; ako repo miruje, proveri da je workflow i dalje uključen.

### B) cron-job.org podešavanje

1. Napravi (besplatan) nalog na https://cron-job.org.
2. **Create cronjob:**
   - **URL:** `https://app.nurolab.rs/api/cron/notifications`
   - **Request method:** `GET`
   - **Schedule:** Every 15 minutes (`*/15 * * * *`).
   - **Advanced → Headers → Add header:**
     - Name: `Authorization`
     - Value: `Bearer <tačan CRON_SECRET>`
3. Save + Enable.

Dispatcher po run-u šalje (sve preko push-a, sa dedup-om po beogradskom danu):
- **dose_reminder_morning / dose_reminder_evening** — kad je trenutno beogradsko vreme u prozoru `[vreme doze, +30min)` i doza još nije uzeta.
- **streak_at_risk** — uveče (`max(21:00, večernja doza + 90min)`), ako je dan nekompletan i streak ≥ 1.

Ne šalje `inactive` niti ne-onboardovanim korisnicima. DST se rešava sam (poredimo beogradsko zidno vreme preko `Intl`).

## Potrebne env varijable (Vercel → Production)

Za cron-ove i notifikacije:

| Var | Koristi |
|---|---|
| `CRON_SECRET` | Auth za sve cron rute (Bearer token) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push (VAPID) |
| `VAPID_PRIVATE_KEY` | Push (VAPID) |
| `VAPID_SUBJECT` | Push (default `mailto:podrska@nurolab.rs`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email (low-stock, welcome) |

Kompletnu launch listu (svih 22 varijable) vidi u [README → Env varijable](../README.md#env-varijable-vercel-launch-lista).

Posle izmene env varijabli → **Redeploy**.

## Push ne stiže?

Vidi [`docs/push-troubleshooting.md`](./push-troubleshooting.md) — dijagnostika po karikama lanca
(VAPID par, pretplate, iOS instalacija, scheduler, statusi push servisa). Brzi put: `/admin` →
„Dijagnostika push-a".

## Ručni test

```bash
# Dispatcher (reminderi / streak-at-risk)
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://app.nurolab.rs/api/cron/notifications
# → 200 + {"now":"HH:mm","morning":N,"evening":N,"streakAtRisk":N}

# Low-stock (email + push)
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://app.nurolab.rs/api/cron/low-stock
# → 200 + {"processed":N,"emailsSent":N,"pushSent":N}
```

Ponovni poziv u istom danu (dispatcher) / u zadnja 3 dana (low-stock) → dedup blokira ponovno slanje (brojači 0).

## Preciznost podsetnika

Podsetnik ne stiže u sekundu — stiže **u prvom pozivu schedulera posle vremena doze**. Zato je
preciznost isporuke ≈ **razmak između poziva**, a prozor postoji samo da podsetnik ne propadne
između dva run-a.

Pravilo uparivanja (proverava ga `scripts/qa-dates.mts`):

```
NOTIFICATION_WINDOW_MIN  ≥  razmak poziva schedulera
```

| Želiš preciznost | Scheduler | `NOTIFICATION_WINDOW_MIN` | Gde radi |
|---|---|---|---|
| „negde u toku pola sata" | `*/15` | `30` (default) | GitHub Actions ili cron-job.org |
| ±5 min | `*/5` | `10` | GitHub Actions (minimum mu je 5 min) ili cron-job.org |
| **u minut** | `* * * * *` | `2` | **samo cron-job.org** — GitHub ne dozvoljava ispod 5 min |

**Cena minutne preciznosti.** Poziv svakog minuta znači 1440 poziva dnevno i, važnije, **Neon baza
se nikad ne uspava** — svaki run je gađa upitom. Na Neon free tier-u autosuspend je jedino što čuva
compute sate, pa proveri limite svog plana pre nego što pređeš na `* * * * *`. Na `*/15` baza se
uspava između poziva; na `*/1` radi 24/7.

Srednje rešenje ako ti je bitna preciznost a ne i budžet: `*/5` + prozor `10`. Korisnik dobija
podsetnik najkasnije 5 min posle vremena doze, a baza i dalje ima prostora da se uspava.

## Dedup pri testiranju

Dedup je **po beogradskom danu i po tipu**. Kad jednom dobiješ `dose_reminder_evening`, drugi taj dan
ne stiže — **ni ako promeniš vreme doze**. Tako i treba (korisnik ne sme da dobije dva podsetnika za
istu dozu), ali znači da se podešavanje može testirati samo jednom dnevno.

Za ponovni test: `/admin` → **Dijagnostika push-a** → dugme **„Resetuj dedup za danas"** (pojavi se
samo kad te dedup stvarno blokira). Briše isključivo **tvoje** današnje push zapise podsetnika —
ne dira tuđe redove, ranije dane, mejlove ni low-stock prozor.
