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

`/api/cron/notifications` mora da se poziva **na 15 min** (vremena doza su individualna, pa reminderi ne mogu na fiksni dnevni cron). Ova ruta **NIJE** u `vercel.json` — vozi je eksterni scheduler.

### cron-job.org podešavanje

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

| Var | Koristi |
|---|---|
| `CRON_SECRET` | Auth za sve cron rute (Bearer token) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push (VAPID) |
| `VAPID_PRIVATE_KEY` | Push (VAPID) |
| `VAPID_SUBJECT` | Push (default `mailto:podrska@nurolab.rs`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email (low-stock, welcome) |

Posle izmene env varijabli → **Redeploy**.

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
