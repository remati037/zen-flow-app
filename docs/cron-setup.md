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

**Dve zamke GitHub cron-a:**
- Raspored **nije precizan** — run zna da kasni nekoliko minuta. Prozor podsetnika je 30 min, a
  pozivi idu na 15, pa jedno kašnjenje ne gubi notifikaciju. Ako ti treba minut-u-minut, uzmi cron-job.org.
- GitHub **automatski gasi** zakazane workflow-e posle **60 dana neaktivnosti repoa**. Za projekat u
  razvoju nije problem; ako repo miruje, proveri da je workflow i dalje uključen.

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

Kompletnu launch listu (svih 21 varijablu) vidi u [README → Env varijable](../README.md#env-varijable-vercel-launch-lista).

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
