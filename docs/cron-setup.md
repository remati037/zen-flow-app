# Cron / scheduler setup

Aplikacija ima tri vrste zakazanih poslova:

## 1. Dnevni Vercel Cron-ovi (`vercel.json`)

Idu automatski preko Vercela (schedule u **UTC**):

| Ruta | Raspored (UTC) | Šta radi |
|---|---|---|
| `/api/cron/low-stock` | `0 8 * * *` | Low-stock alert na **email + push** (dedup 3 dana, nezavisno po kanalu) |
| `/api/cron/refresh-access` | `0 3 * * *` | Osvežava `access_status` (VIP prozor) |

Ne zahtevaju ručno podešavanje — dovoljno je da je `CRON_SECRET` postavljen na Vercelu; Vercel Cron šalje `Authorization: Bearer <CRON_SECRET>` automatski.

> **Hobby plan dozvoljava najviše 2 cron posla.** Oba su zauzeta. Treći unos u `vercel.json` se
> ne kreira — i to **tiho**, bez greške u buildu, pa bi posao „radio" nigde. Zato dnevni izveštaj
> (ispod) ide kroz GitHub Actions, a ne kroz Vercel Cron.

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
   **preskoči**. Zato je prozor podsetnika **45 min** (default), a ne 15 kao kadenca: pokrivenost je
   potpuna dok je STVARAN razmak između dva poziva ≤ prozor, a razmak je
   `15 × (1 + broj preskočenih) + razlika u kašnjenju`. Prozor od 45 tako pokriva „jedan preskočen
   run + do 15 min dodatnog kašnjenja"; prozor od 30 pokrivao je samo preskok bez ijednog minuta
   kašnjenja — a upravo se kašnjenje i dešava. Ako ti treba pouzdano, uzmi **cron-job.org** (opcija B).

   Da li se rupa stvarno desila **ne moraš da nagađaš**: `/admin` → „Dijagnostika push-a" pokazuje
   kad je dispatcher poslednji put pozvan i koja je najveća izmerena rupa (vidi „Alert kad dispatcher
   ćuti" niže).
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
- **dose_reminder_morning / dose_reminder_evening** — kad je trenutno beogradsko vreme u prozoru `[vreme doze, +NOTIFICATION_WINDOW_MIN)` (default 45 min) i doza još nije uzeta.
- **streak_at_risk** — uveče (`max(21:00, večernja doza + 90min)`), ako je dan nekompletan i streak ≥ 1.

Ne šalje `inactive` niti ne-onboardovanim korisnicima. DST se rešava sam (poredimo beogradsko zidno vreme preko `Intl`).

## 3. Dnevni izveštaj o isporučenosti (GitHub Actions)

`/api/cron/daily-report` agregira **jučerašnji** beogradski dan iz `notifications_log` i upisuje
jedan strukturni JSON red (`observability.daily_report`) plus WARN redove za stanja koja traže
reakciju (mrtav dispatcher, nezatvorene rezervacije, neuspela slanja).

| Workflow | Raspored (UTC) | Šta radi |
|---|---|---|
| `.github/workflows/daily-report.yml` | `30 6 * * *` | Zove `/api/cron/daily-report`, warning-e podiže i u Actions pregled |

Meri **juče**, ne danas: današnji dan je nepotpun dok traje, pa bi „0 poslatih" u 00:30 bila lažna
uzbuna svakog jutra. Treba mu isti `CRON_SECRET` repo secret kao dispatcher-u — ako je dispatcher
već podešen, ovde nema šta da se radi.

Isti agregat (14 dana, po danu × kanalu × tipu) vidi se u **`/admin` → „Isporučenost notifikacija"**,
uživo iz baze — panel ne zavisi od toga da li je cron prošao.

## Potrebne env varijable (Vercel → Production)

Za cron-ove i notifikacije:

| Var | Koristi |
|---|---|
| `CRON_SECRET` | Auth za sve cron rute (Bearer token) |
| `NOTIFICATION_WINDOW_MIN` | Širina prozora podsetnika u minutima (default `45`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push (VAPID) |
| `VAPID_PRIVATE_KEY` | Push (VAPID) |
| `VAPID_SUBJECT` | Push (default `mailto:podrska@nurolab.rs`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email (low-stock, welcome) |
| `EMAIL_UNSUBSCRIBE_SECRET` | *Opciono.* Potpis odjavnih linkova; bez njega se koristi `CRON_SECRET` |

Kompletnu launch listu (svih 23 varijable) vidi u [README → Env varijable](../README.md#env-varijable-vercel-launch-lista).

Posle izmene env varijabli → **Redeploy**.

## Alert kad dispatcher ćuti

Najgori otkaz podsetnika nije greška — nego **tišina**: scheduler prestane da poziva rutu i niko to
ne primeti. `notifications_log` tu ne pomaže, jer run koji nije imao kome da pošalje ne ostavlja
nijedan red — „scheduler je mrtav" i „danas nije bilo kandidata" izgledaju identično.

Zato **svaki** run cron rute upisuje heartbeat u tabelu `cron_runs` (jedan red po poslu, ne raste):
kad je poslednji put pozvan, koliki je bio razmak od prethodnog poziva, i koja je najveća ikad
izmerena rupa. Ne treba nikakav novi servis ni nalog.

Alert se čita na dva mesta:

- **`/admin` → „Dijagnostika push-a"** — redovi „Scheduler (poslednji poziv)" i „Najveća rupa u
  rasporedu", plus **blocker na vrhu** kad nešto nije u redu.
- **odgovor same rute** (`schedule.gapMissedWindow`) — vidi se u logu GitHub Actions-a odmah.

Stanja:

| Stanje | Kad | Šta znači |
|---|---|---|
| ✅ `ok` | poslednji poziv pre < 2h, bez rupa | podsetnici izlaze |
| ⚠️ `gaps` | živ, ali je bar jednom ćutao duže od prozora | radi, ali su podsetnici u toj rupi **izgubljeni** |
| ❌ `stale` | nije pozvan **2h ili duže** | podsetnici trenutno NE izlaze |
| ❌ `never` | nijedan poziv ikad | scheduler nije podešen ili ne pogađa rutu |

Prag od 2h (`DISPATCHER_STALE_HOURS` u `lib/cron/health.ts`) je namerno iznad najgoreg normalnog
kašnjenja GitHub-a (~1h): alert koji vrišti bez razloga prestane da se čita.

**Kad vidiš `stale` ili `never`:** Actions → „Notification dispatcher" → da li ima `schedule`
run-ova; da li se `CRON_SECRET` poklapa sa Vercelom; da li je workflow ugašen posle 60 dana
neaktivnosti repoa.

**Kad vidiš `gaps`:** raspored radi ali propada. Ili proširi `NOTIFICATION_WINDOW_MIN`, ili pređi na
cron-job.org (opcija B).

## Push ne stiže?

Vidi [`docs/push-troubleshooting.md`](./push-troubleshooting.md) — dijagnostika po karikama lanca
(VAPID par, pretplate, iOS instalacija, scheduler, statusi push servisa). Brzi put: `/admin` →
„Dijagnostika push-a".

## Ručni test

```bash
# Dispatcher (reminderi / streak-at-risk)
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://app.nurolab.rs/api/cron/notifications
```

Odgovor je razložen po tipu, da se iz njega vidi ŠTA se desilo, a ne samo koliko je poslato:

```jsonc
{
  "now": "20:15", "today": "2026-08-25",
  "windowMin": 45,              // aktivan NOTIFICATION_WINDOW_MIN
  "eligibleProfiles": 42,       // aktivni + onboardovani (kandidati za bilo šta)
  "totals": { "candidates": 7, "sent": 3, "failed": 0, "skipped": 4 },
  "byType": {
    "dose_reminder_evening": {
      "candidates": 5,          // ušli u vremenski prozor
      "sent": 3,
      "failed": 0,              // push servis odbio (detalji u Vercel logu)
      "skippedDedup": 1,        // već obavešten danas — očekivano, nije problem
      "skippedNoSubscription": 1,
      "skippedNoStreak": 0
    }
    // ... dose_reminder_morning, streak_at_risk
  },
  "durationMs": 812,
  "schedule": {
    "gapMin": 15,               // razmak od prethodnog poziva
    "gapMissedWindow": false,   // true = rupa šira od prozora → izgubljeni podsetnici
    "maxGapMin": 47,            // najveća ikad izmerena rupa
    "runsTotal": 1284
  }
}
```

```bash
# Low-stock (email + push)
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://app.nurolab.rs/api/cron/low-stock
# → 200 + {"processed":N,"dedupDays":3,"byChannel":{"email":{...},"push":{...}},"totals":{...}}
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
| „negde u toku sata", otporno na jitter | `*/15` | `45` (default) | GitHub Actions ili cron-job.org |
| ±5 min | `*/5` | `15` | GitHub Actions (minimum mu je 5 min) ili cron-job.org |
| **u minut** | `* * * * *` | `2` | **samo cron-job.org** — GitHub ne dozvoljava ispod 5 min |

Prozor **nije** isto što i preciznost: on je rezerva za kašnjenje schedulera, pa mora biti širi od
kadence. Na GitHub Actions-u drži ga na `45` — tamo raspored kasni i preskače. Na cron-job.org-u,
koji je precizan, prozor sme da bude uzak (kadenca + par minuta).

**Cena širokog prozora.** Doza podešena posle **23:15** dobija podsetnik ranije nego što je podešena
(prozor mora ceo da stane u dan — vidi `LATEST_WINDOW_START_MIN`). Pri prozoru 45 to je najviše 30
min ranije. Alternativa je bila da takav podsetnik ne stigne uopšte, pa je razmena svesna.

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
