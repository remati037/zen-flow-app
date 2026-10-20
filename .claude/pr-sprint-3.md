## Šta
Sprint 3 iz audita: win-back za kupce kojima je istekao pristup i feedback niza na dashboardu. **Stoji na Sprintu 2** (base: `sprint-2-supply-alerts`); spojiti posle #2 i #3.

### Feedback niza
- **Brojač se pomera odmah na tap.** `ProtocolCtaCard` je sada klijentska komponenta; niz se računa optimistično iz stanja `DoseCheckin`-a (`current − server danas + lokalno danas`), a greška ga vraća zajedno sa dugmetom.
- **Slavlje kompletnog dana:** poseban toast sa nizom, konfete (ako nema novog bedža — bedž ih već ispaljuje), kratka vibracija na Androidu.
- **„Još X dana do bedža …"** — sledeći prag iz kataloga bedževa.
- **„Niz od N dana je u opasnosti"** posle večernjeg termina (ili 20h) ako dan nije kompletan — karta prelazi u ink varijantu. Računa se posle mount-a (bez hydration mismatch-a) i osvežava na minut.

### Win-back
- **Tri mejla posle isteka pristupa:** 1–6, 7–13 i 21–27 dana. Gornja granica sprečava talas mejlova ka svim bivšim kupcima pri puštanju.
- Kandidati u SQL-u: `inactive`, rola `user`, bez ručnog override-a. Šalje se iz jutarnjeg `low-stock` run-a, ne noću.
- Opt-out i one-click odjava kao kod low-stock alerta (`EMAIL_ALERT_TYPES`). Dedup po fazi + dnevna rezervacija.
- **`/nemas-pristup`** razlikuje povratnog kupca („protokol je pauziran", pauziran niz, „Nastavi protokol") od naloga bez kupovine.

### Sitnice
- Rodno neutralni tekstovi u app-u i mejlovima („Dobrodošlica u NuroLab", „istim mejlom kao pri kupovini"…).
- Low-stock mejl: dupla tačka posle datuma („22.10.2026..").

## Testiranje
- `npm run qa` — **257 / 50 / 89**; nove provere: sledeći bedž, srpska množina, win-back faze, SQL kandidata (faza 1/2, stari kupac, override) nad pravim Postgres-om.
- Mejl šabloni renderovani u tekst i pročitani (sve 3 faze + low-stock po datumu).
- `npm run build` — prolazi, bez upozorenja.
- ⚠️ Dashboard karta i `/nemas-pristup` nisu vizuelno provereni u browseru (nema lokalne Neon baze) — pogledati na Vercel preview-u.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
