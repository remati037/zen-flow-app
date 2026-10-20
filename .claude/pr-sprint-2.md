## Šta
Sprint 2 iz audita: zalihe, low-stock alerti i pouzdanost cron-ova. **Stoji na Sprintu 1** (base: `sprint-1-hardening`); spojiti posle njega.

- **Onboarding:** početne zalihe oduzimaju protekle dane od početka protokola (ranije: start pre 20 dana = +80 kapsula viška, alert kasnio ~20 dana). Prefil pakovanja samo iz porudžbina u prozoru pristupa. Profil + zalihe + kviz u JEDNOJ izjavi (`lib/onboarding/finalize.ts`): dupli submit više ne resetuje zalihe, pad na pola ne ostavlja korisnika bez `supply` reda.
- **Woo top-up:** jedna izjava sa deltom umesto read-then-write (paralelan check-in je bio pregažen). Backfill dopunjuje porudžbine od dana posle onboardinga — kupac koji je platio dok je Woo webhook bio ugašen više ne ostaje na 0.
- **Low-stock po datumu:** alert se pali i kad `estimated_runout_date` ≤ danas + 4 — hvata korisnike koji piju, a ne štikliraju. Poruka tada ne prikazuje (netačan) broj kapsula. UI kartice koriste isto pravilo.
- **0 kapsula:** jutarnji podsetnik postaje poruka o dopuni (`/zalihe`); večernji i streak-at-risk se preskaču.
- **Cron:** heartbeat za `refresh-access`; heartbeat i kad run padne; dnevni izveštaj prijavljuje stale dnevne poslove i pale run-ove.
- **Logovi:** `DrizzleQueryError` bez `params` (mejl, push ključevi); backfill bez mejla u logu.
- **Admin:** „Porudžbine 30d" broji samo važeće statuse.

## Testiranje
- `npm run qa` — **238 / 50 / 84**. `qa-sql` je pokrenut nad pravim Postgres-om (lokalni `postgresql@16`): nove provere za onboarding (jednokratnost), Woo top-up (delta, reset epizode, ponovljen webhook) i backfill (pre/isti/posle dana onboardinga).
- `npm run build` (webpack) — prolazi, bez upozorenja.
- ⚠️ Cron rute i onboarding nisu ručno okinuti end-to-end (nema lokalne Neon baze).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
