# Status: ZenFlow app (NuroLab Companion PWA)
Ažurirano: 2026-10-19
Faza: pred-lansiranje

## Gde smo stali
Faza 1 i Faza 2 blokovi 1–3 su zatvoreni. Urađena je kompletna analiza: funkcionalnost, sigurnost, UI/UX i kod.

Sprint 1 je završen na grani `sprint-1-hardening`:
- Next 16.4.2, Clerk 7.9, Serwist 9.5.13 (`npm audit`: 0 ranjivosti)
- refill CTA ide na shop sa UTM-om (`lib/refill.ts`), i iz mejla
- service worker više ne kešira privatne stranice i API odgovore
- gejt pristupa radi u svakoj stranici (`requireAppAccess`)
- check-in posle ponoći više ne upisuje juče
- QA skripte rade na putanji sa razmakom
- Clerk ekrani su na srpskoj latinici, sa uputstvom da se registruje mejlom sa kupovine

Sprint 2 je završen na grani `sprint-2-supply-alerts` (stoji na Sprintu 1):
- onboarding: zalihe oduzimaju protekle dane, prefil samo iz porudžbina u prozoru pristupa, upis atomaran (bez duplog submit-a i polovičnog stanja)
- Woo top-up je atomaran; backfill dopunjuje porudžbine posle onboardinga
- low-stock alert se pali i po procenjenom datumu (hvata korisnike koji ne štikliraju)
- na 0 kapsula: umesto „vreme je za dozu" stiže poruka o dopuni
- heartbeat za `refresh-access`; dnevni izveštaj prijavljuje stale i pale cron-ove
- logovi više ne nose mejlove ni parametre upita
- QA: 238 / 50 / 84 provere (novi SQL se izvršava nad pravim Postgres-om)

Sprint 3 je završen na grani `sprint-3-winback-streak` (stoji na Sprintu 2):
- dashboard: brojač niza se pomera odmah na tap, kompletan dan ima slavlje, „još X dana do bedža", „niz u opasnosti" posle večernjeg termina
- win-back: 3 mejla posle isteka pristupa (1., 7. i 21. dan), uz opt-out
- `/nemas-pristup` za povratnog kupca: „protokol je pauziran", niz i dugme za dopunu
- rodno neutralni tekstovi u app-u i mejlovima; ispravljena dupla tačka u datumu low-stock mejla
- QA: 257 / 50 / 89

Sprint 4 je završen na grani `sprint-4-admin-push-perf` (stoji na Sprintu 3):
- admin `/admin/retencija`: funnel, ponovna kupovina sa/bez app-a, konverzija low-stock alerta, liste „ističu uskoro", „istekao pristup", „kupili a nemaju nalog"
- dugme „✓ Uzeto" u podsetniku za dozu (Android/desktop; iOS ga ne podržava)
- manje DB poziva po stranici i check-in-u (keširan profil i porudžbine)
- QA: 266 / 52 / 100 (check-in iz app-a sada se izvršava nad Postgres-om)

Sprint 5 je završen na grani `sprint-5-a11y-states` (stoji na Sprintu 4):
- loading skeleton i srpski ekrani za greške, 404 i pad celog layout-a
- check-in bez mreže: vraća dugme i jasno kaže „Nema internet veze"
- pristupačnost: vidljiv fokus, veća dugmad i polja (≥ 44px), tekst ≥ 12px, aria opisi, poštuje „Smanji pokrete"
- iPhone notch (safe area) u headeru, `colorScheme: light`, svetla theme boja, PWA otvara pravo dashboard
- uklonjen Clerk meni iz headera (dupliran sa Podešavanjima)

Sprint 6 je na grani `sprint-6-copy-design` (stoji na Sprintu 5):
- druga doza je „popodnevna" (preporuka oko 14h)
- ceo copy bez „—", prirodniji, bez emotikona u tekstu
- Focus Score kviz bez smajlija (skala 1–5)
- Zalihe: animirana bočica (mockup crtež do prave bočice)
- premium dizajn: tamna glavna kartica sa brojačem niza, doze kao redovi, pregled kao grupisana lista, bedževi u mreži, ujednačeni naslovi i kartice bez teških senki
- lokalni razvoj: `npm run dev:seed` + lokalni Postgres (testiranje bez produkcije)

## Sledeći korak
- Vladimir spoji PR-ove redom: Sprint 1 → 2 → 3 → 4 → 5 → 6
- Prava bočica (SVG/PNG) → zamena mockup crteža u `components/supply/supply-bottle.tsx`
- Na Vercelu dodati Preview env varijable (dev Neon + Clerk dev ključevi) da preview deploy-evi rade
- Proveriti region: Vercel funkcije vs Neon (ako je Neon u EU, `"regions": ["fra1"]` u vercel.json)
- Sledeće (po želji): Woo zaštita od redosleda webhook-a (migracija 0005), loading/error ekrani, pristupačnost (fokus, veličina dugmadi), Stripe/Faza 2

## Šta fali od Vladimira
- dev Neon `DATABASE_URL` i pravi Clerk dev ključevi u `.env.local` (sada su tu privremeni Clerk keyless ključevi)
- `NEXT_PUBLIC_SHOP_REFILL_URL` na Vercelu kad webshop proradi
- odluka o pristupu za kupce koji uzmu više pakovanja (danas je fiksno 60 dana)
- odobrenje za migraciju `0005` (indeksi + `date_modified` za Woo porudžbine)

## Otvorena pitanja / rizici
- Webshop još nije aktivan: dok `NEXT_PUBLIC_SHOP_REFILL_URL` nije postavljen, refill CTA u app-u se ne prikazuje, a mejl vodi na `/zalihe`
- Woo webhook nema zaštitu od redosleda isporuke (refund pa zakasneli `processing` vraća VIP)
