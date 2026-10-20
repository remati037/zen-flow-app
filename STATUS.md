# Status: ZenFlow app (NuroLab Companion PWA)
Ažurirano: 2026-10-20
Faza: pred-lansiranje

## Gde smo stali
Faza 1 i Faza 2 blokovi 1–3 su zatvoreni, sprintovi 1–6 i „Moj stack" su gotovi. Svi PR-ovi (#2–#8)
imaju zelen CI i čekaju spajanje; `master` je i dalje PRE svih sprintova.

Pred lansiranje, grana `pred-lansiranje` (stoji na `moj-stack`):
- **Pristanak za podatke o zdravlju** (doze, zalihe, kviz i Moj stack su posebne vrste podataka po ZZPL/GDPR):
  - u onboardingu: korak 3 „Tvoji podaci" pre kviza, bez štikliranja nema nastavka
  - postojeći nalozi dobijaju `/saglasnost` pri sledećem ulasku
  - server odbija upis bez pristanka (provereno u browseru)
- **Brisanje naloga** (Podešavanja → Privatnost, i sa `/nemas-pristup`): briše nalog i sve podatke iz app-a, a porudžbine ostaju kao evidencija prodavnice. QA proverava da posle brisanja ne ostane nijedan red.
- **Woo redosled webhook-ova**: refund pa zakasneli `processing` više ne vraća VIP (`orders.woo_modified_at`)
- **Migracija `0006`** (`orders.woo_modified_at`, `profiles.health_consent_at`), primenjena samo lokalno
- `db:status` više ne prijavljuje lažno „nedostaje sve" nad lokalnom bazom
- dokumentacija: zastarele stavke ispravljene, za podsetnike preporuka cron-job.org + GitHub kao rezerva
- QA: 357 / 54 / 208, build prolazi
- U browseru (lokalno, 375px) provereni: `/saglasnost`, korak pristanka u onboardingu, Podešavanja → Privatnost, dijalog brisanja (otvoren pa otkazan), `/stack` (pretraga, dodavanje, grupisanje) i serverski gejt pristanka

## Sledeći korak
1. Vladimir spoji PR-ove redom #2 → #8 (pa PR za `pred-lansiranje`), **običnim merge-om, ne squash-om**, jer su PR-ovi naslagani jedan na drugi
2. Na produkcionu bazu primeniti `0005` i `0006` PRE deploy-a, pa posle deploy-a proveriti `/api/cron/db-check`
3. Postaviti `NEXT_PUBLIC_PRIVACY_POLICY_URL` i `NEXT_PUBLIC_SHOP_REFILL_URL` na Vercelu
4. Raspored podsetnika: cron-job.org kao glavni, GitHub Actions ostaje kao rezerva (`docs/cron-setup.md`)
5. Proveriti region (Vercel funkcije vs Neon) i dodati Preview env varijable
6. Prava bočica (SVG/PNG) → `components/supply/supply-bottle.tsx`

## Šta fali od Vladimira
- **odluka: koliko traje pristup za kupce više pakovanja** (sada fiksno 60 dana, a pakovanje traje 15 dana, pa se pauza niza praktično nikad ne uključi)
- pravnik da potvrdi tekst pristanka (`lib/legal.ts`) i da dopuni politiku privatnosti na nurolab.rs (podaci o zdravlju, Moj stack, zbirna upotreba, brisanje), pa njen URL
- spajanje PR-ova i migracije na produkciji (vidi gore)
- `NEXT_PUBLIC_SHOP_REFILL_URL` kad webshop proradi
- nalog na cron-job.org (glavni scheduler)
- `/admin/stack` nije proveren u browseru: lokalni nalog nije admin

## Otvorena pitanja / rizici
- Deploy pre migracije `0006` obara SVAKU stranicu (`profiles.health_consent_at` je u svakom upitu profila). Viđeno lokalno, pa redosled „migracija pa deploy" nije opcion.
- Webshop još nije aktivan: bez `NEXT_PUBLIC_SHOP_REFILL_URL` dugme za dopunu se ne prikazuje, pa retencioni krug nije zatvoren
- Spisak suplemenata je zdravstveni podatak: ostaje van izveštaja na nivou korisnika
- Kad se tekst pristanka suštinski promeni, treba obrisati `health_consent_at` svima (nova potvrda)
