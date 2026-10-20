## Šta
Sprint 6: povratne informacije posle prvog pregleda aplikacije. **Stoji na Sprintu 5** — spajati redom #2 → … → #6 → ovaj.

### Sadržaj
- **Popodnevna doza** (preporuka oko 14h) umesto večernje: oznake, ikone, podrazumevano 14:00, push „Vreme je za popodnevnu dozu". „Niz u opasnosti" i dalje kreće od 21h.
- **Copy:** nijedan „—" u tekstu koji korisnik vidi (app, mejlovi, push, admin), prirodnije rečenice, rodno neutralno, bez emotikona u toastovima/push-u/mejlovima.
- **Focus Score kviz:** skala 1–5 sa nivoom umesto smajlija.
- **Zalihe:** animirana bočica koja se puni kapsulama srazmerno zalihama (mockup crtež dok ne stigne prava bočica; zamena je samo crtež u `supply-bottle.tsx`). Prikaz u `/style-guide`.

### Premium dizajn
- Dashboard: tamna (ink) glavna kartica sa velikim lime brojačem niza, napredak ka bedžu kao tanka linija, doze kao redovi; zalihe/fokus/bedževi kao jedna grupisana lista.
- Protokol: tipografski brojač niza (bez 🔥); Bedževi u mreži 2×; donja navigacija bez lime pilule; kartice bez teških senki, ujednačeni naslovi; tanak Pomodoro prsten.

### Lokalni razvoj
- `lib/db`: van produkcije `DATABASE_URL` na `localhost` koristi `pg` drajver (neon-http radi samo sa Neon-om). `require` je u mrtvoj grani za produkciju.
- `npm run dev:seed -- --email <mejl> [--history N] [--reset]`: poveže Clerk test nalog sa lokalnom bazom (webhook ne stiže do localhost-a), test porudžbina, istorija. Radi SAMO nad lokalnom bazom i `sk_test_` ključem.

## Testiranje
- `npm run qa` — 266 / 52 / 100 (lokalni Postgres), `npm run build` prolazi.
- Ručno u browseru, lokalno, sa pravim nalogom i lokalnom bazom (mobilna širina): dashboard, check-in jutarnje doze (bedž „Prva doza", konfete, zalihe 120 → 118), Protokol, Zalihe (bočica 58/60 + „1 puna bočica"), Fokus, Bedževi, Podešavanja.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
