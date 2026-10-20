## Šta
Sprint 4 iz audita. **Stoji na Sprintu 3** (base: `sprint-3-winback-streak`); spojiti redom #2 → #3 → #4 → ovaj.

### Admin `/admin/retencija`
- **Funnel:** kupci → registrovani → onboardovani → aktivni (doza u poslednjih 7 dana).
- **Ponovna kupovina sa app-om vs bez app-a** — signal da li app vraća kupce.
- **Low-stock alert → porudžbina** u 7 dana (alerti iz poslednjih 30 dana).
- **Liste za akciju:** ističu u narednih 5 dana · istekao pristup (28 dana) · kupili, a nemaju nalog.
- Sve agregacije u SQL-u (`lib/admin/retention.ts`), liste do 50 redova.

### „✓ Uzeto" u podsetniku za dozu
- Jutarnji i večernji podsetnik nose dugme koje upisuje dozu **bez otvaranja app-a** (Android/desktop Chrome; iOS Safari ne podržava akcije — klik i dalje otvara app).
- `/api/push/checkin` je javna (SW nema Clerk sesiju) i autentikuje se HMAC tokenom vezanim za korisnika + dan + dozu; prihvata samo danas/juče i isti gejt pristupa kao app.
- Upis ide kroz `recordDose` — istu funkciju koju zove `logDose` (izdvojena u `lib/protocol/record-dose.ts`).
- Uspeh: tiha potvrda („Doza zabeležena 🌿" / „Dan je kompletan! Niz: N 🔥"); neuspeh otvara `/protokol`.
- `SW_VERSION` 1.20.0.

### Performanse
- `getCurrentProfile` u React `cache()` — jedan upit po zahtevu umesto tri.
- Gejt pristupa i streak dele jedan keširan upit porudžbina (`lib/access/orders.ts`).

### QA
- Ključevi bedževa izdvojeni u `lib/badges/keys.ts` (bez `lucide-react`) — award engine i check-in se sada **izvršavaju** u `qa-sql`. Ranije nisu mogli (ikone pucaju van Next runtime-a), pa najvažnija putanja (check-in → zalihe → bedževi) nije bila pokrivena.

## Testiranje
- `npm run qa` — **266 / 52 / 100** (lokalni Postgres): check-in (double-tap, undo, prozor), retencioni upiti, token (korisnik/dan/doza/skraćen/bez tajne), `/api/push/checkin` klasifikovana kao javna.
- `npm run build` — prolazi; SW sadrži akciju „Uzeto".
- ⚠️ Dugme u notifikaciji nije probano na uređaju — test: uključi push na Androidu, `Admin → Test push` ne nosi dugme; sačekaj pravi podsetnik ili privremeno pomeri vreme doze.

## Posle merge-a
- Opciono `PUSH_ACTION_SECRET` na Vercelu (bez njega se koristi `CRON_SECRET`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
