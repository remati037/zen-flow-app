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

## Sledeći korak
- Vladimir pregleda i spoji granu `sprint-1-hardening`
- Sprint 2: popravke zaliha i alerta (onboarding, backfill, okidač po datumu, 0 kapsula) i heartbeat za cron-ove

## Šta fali od Vladimira
- dev Neon `DATABASE_URL` i pravi Clerk dev ključevi u `.env.local` (sada su tu privremeni Clerk keyless ključevi)
- `NEXT_PUBLIC_SHOP_REFILL_URL` na Vercelu kad webshop proradi
- odluka o pristupu za kupce koji uzmu više pakovanja (danas je fiksno 60 dana)
- odobrenje za migraciju `0005` (indeksi + `date_modified` za Woo porudžbine)

## Otvorena pitanja / rizici
- Webshop još nije aktivan: dok `NEXT_PUBLIC_SHOP_REFILL_URL` nije postavljen, refill CTA u app-u se ne prikazuje, a mejl vodi na `/zalihe`
- Kupci kojima pristup istekne ne dobijaju nikakvu poruku (nema win-back toka)
- Woo webhook nema zaštitu od redosleda isporuke (refund pa zakasneli `processing` vraća VIP)
