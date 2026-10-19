# Moj stack — evidencija dodatnih suplemenata (design spec)

Datum: 2026-10-19 · Faza 2 · Status: za pregled

## Cilj

Korisnici beleže koje još suplemente piju. NuroLab dobija zbirni uvid u stack publike
(osnova za odluku o sledećem proizvodu / bundle-u). Korisnik dobija pregled svog stack-a i
nedeljnu potvrdu da je i dalje tačan.

## Van obima (namerno)

- Dnevni check-in dodatnih suplemenata, istorija unosa, streak ili bedževi za njih. Streak
  ostaje samo na ZenFlow protokolu.
- Preporuke, upozorenja o interakcijama, bilo kakve zdravstvene tvrdnje.
- Novi push/mejl podsetnik za potvrdu (nedeljna potvrda je samo kartica u appu).
- Saglasnost u aplikaciji (odluka: ne treba). Politika privatnosti na `nurolab.rs` treba da
  pokrije prikupljanje zbirnih podataka o stack-u — to je posao van repoa.
- Admin izmena kataloga iz UI-ja (katalog je konstanta u kodu).

## Model podataka (migracija `0005`)

Jedna tabela `user_supplements`:

| Kolona | Tip | Napomena |
|---|---|---|
| `id` | serial PK | |
| `user_id` | text NOT NULL → `profiles.id` ON DELETE CASCADE | |
| `catalog_key` | text NULL | ključ iz `lib/supplements/catalog.ts` |
| `custom_name` | text NULL | slobodan unos („Drugo"), trim, 1–60 znakova |
| `time_of_day` | enum `morning` \| `afternoon` \| `evening` NOT NULL | |
| `dose_note` | text NULL | slobodan tekst, max 40 znakova |
| `active` | boolean NOT NULL default true | uklanjanje = `false`, red ostaje |
| `merged_into_key` | text NULL | admin spaja slobodan unos sa ključem kataloga |
| `last_confirmed_on` | date NOT NULL | beogradski dan (`belgradeToday()`), postavlja se pri upisu |
| `created_at` | timestamptz NOT NULL default now() | |

Ograničenja i indeksi:

- CHECK `num_nonnulls(catalog_key, custom_name) = 1` — tačno jedno od dva.
- CHECK `merged_into_key is null or custom_name is not null` — spajanje ima smisla samo za slobodan unos.
- Jedinstveni parcijalni indeks `(user_id, catalog_key) WHERE catalog_key IS NOT NULL` — isti
  suplement iz kataloga ne može dvaput. Slobodni unosi nemaju ovo ograničenje.
- Jedinstveni funkcionalni indeks `(user_id, lower(custom_name)) WHERE custom_name IS NOT NULL`
  — isti slobodan naziv ne može dvaput (case-insensitive).
- Indeks `(user_id)` za učitavanje liste.
- Parcijalni indeks `(catalog_key) WHERE active` za admin agregat.

Ponovno dodavanje suplementa koji je ranije uklonjen **reaktivira postojeći red**
(`on conflict ... do update set active = true, time_of_day = ..., ...`), jer jedinstveni
indeksi ne dozvoljavaju drugi. Upis je jedna SQL izjava (neon-http nema transakcije).

`EXPECTED_SCHEMA` (`lib/db/expected-schema.ts`) dobija tabelu, enum, oba CHECK-a i sve indekse;
`qa-sql` pada ako nešto fali.

## Katalog

`lib/supplements/catalog.ts` — čist modul bez `server-only`, ~100 stavki:
`{ key, label, category, aliases }`. Ključevi su stabilni (`magnesium`, `omega3`, `vitamin_d3`,
`creatine`, `collagen`, `whey_protein`, ...). ZenFlow se NE nalazi u katalogu (prati se
protokolom). Predlog liste (108 stavki, po kategorijama, sa srpskim i engleskim aliasima) je u
`2026-10-19-moj-stack-katalog-predlog.md`; Vladimir ga seče na konačnih ~100. Promena kataloga
je deploy, bez migracije.

**Pretraga** (`searchCatalog(query)` u istom modulu, čista funkcija, testirana u `qa-dates`):
- normalizacija: mala slova, uklanjanje dijakritika (`č ć š ž đ` → `c c s z dj`; `dj`/`d` oba
  matchuju) i razmaka/crtica, na upitu i na label/aliasima;
- poklapanje po prefiksu reči, pa po podstringu; prefiks rangira iznad podstringa, a poklapanje
  naziva iznad poklapanja aliasa;
- primeri koji moraju raditi: `kolagen`, `collagen`, `magnezijum`, `mg`, `kreatin`, `protein`,
  `cink`/`zink`, `riblje ulje` → Omega-3, `ashvaganda`, `b12`;
- pretraga radi na klijentu nad statičnom listom (bez upita ka bazi); kategorije su filter-čipovi
  kad je upit prazan.
- Kad upit nema rezultata, prvi red je „Dodaj kao Drugo: ‹upit›". Ključ koji je izbačen iz kataloga ostaje u bazi i prikazuje se kao
sirov naziv — admin ga vidi u agregatu.

## Akcije (`app/(app)/stack/actions.ts`)

Sve kroz `createAction` (auth + gejt pristupa + zod). Zod šeme u `lib/validations/stack.ts`.

- `addSupplement` — `{ catalogKey } | { customName }`, `timeOfDay`, `doseNote?`. Postavlja
  `last_confirmed_on = belgradeToday()`.
- `updateSupplement` — `id`, `timeOfDay?`, `doseNote?`, `active?`. Provera da red pripada
  korisniku je u samom `WHERE user_id = ...`.
- `confirmStack` — „Isti je": `last_confirmed_on = belgradeToday()` za sve aktivne redove korisnika.
- `clearStack` — briše sve redove korisnika.
- Admin (`admin: true`): `mergeCustomSupplement` — `{ normalizedName, intoKey }` postavlja
  `merged_into_key` na sve redove sa tim `lower(custom_name)`; `intoKey` mora postojati u katalogu.
  `intoKey = null` poništava spajanje.

Svaka izmena liste (add/update/clear) osvežava `last_confirmed_on` za aktivne redove —
korisnik koji je upravo uredio stack ne dobija karticu potvrde.

## UI

**`/stack`** (`requireAppAccess()` na početku stranice, `loading.tsx` / `error.tsx` po konvenciji):

- Lista grupisana po dobu dana; red: naziv, napomena o dozi, prekidač „Još pijem".
- „Dodaj suplement": izbor iz kataloga sa pretragom + opcija „Drugo" (tekstualno polje).
- „Obriši ceo stack" sa potvrdom.
- Kartica potvrde na vrhu kad je uslov ispunjen.
- Klijentski pozivi akcija hvataju izuzetke i vraćaju optimistično stanje (kao `DoseCheckin`).
- A11y minimum iz CLAUDE.md: cilj za dodir ≥ 44px, `aria-label` na ikonicama, tekst ≥ 12px,
  fokus pun ink, `prefers-reduced-motion`. Tekstovi rodno neutralni.
- Boje samo kroz brand tokene.

**Dashboard**: mala kartica „Moj stack" koja vodi na `/stack`; kad je potvrda potrebna, kartica
prikazuje pitanje „Da li je stack i dalje isti?" sa dugmadima „Isti je" / „Izmeni".

**Nedeljna potvrda** — čisto pravilo u `lib/supplements/confirm-rules.ts` (bez `server-only`):
`needsConfirmation(activeCount, lastConfirmedOn, today)` → `true` ako `activeCount > 0` i
`today − min(last_confirmed_on)` ≥ 7 beogradskih kalendarskih dana. Razlika se računa nad
datumskim stringovima kroz helpere iz `lib/dates.ts`, nikad ms-aritmetikom. „Danas" je isključivo
`belgradeToday()`.

## Admin `/admin/stack`

`requireAdmin`, ruta klasifikovana kao admin u `qa-routes`. Logika u `lib/admin/stack.ts`.

- **Tabela po suplementu**: efektivni ključ = `coalesce(catalog_key, merged_into_key, 'custom:' || lower(custom_name))`;
  broji korisnike sa `active` i `last_confirmed_on >= danas − 30 dana`; udeo = broj / onboardovani
  korisnici (`onboarding_completed = true`). Zastareli unosi (nepotvrđeni > 30 dana) se izuzimaju
  iz „aktivnih" i prikazuju kao zasebna kolona.
- **Slobodni unosi**: nespojeni `custom_name` grupisani po `lower(custom_name)`, sa brojem korisnika,
  sortirano opadajuće, max 50 redova. Dugme „Spoji sa…" poziva `mergeCustomSupplement`.
- Samo agregat — nikad ime, mejl ni `user_id`. Prag minimalne veličine grupe za prikaz: grupe sa
  manje od 3 korisnika prikazuju se kao „< 3" (zaštita od identifikacije u maloj bazi).
- `GROUP BY` nad izrazom nikad ne nosi bind parametar; konstante preko `sql.raw` (vidi `lib/admin/delivery.ts`).

## Testovi

- **`qa-sql`** (nova sekcija): PRAVE funkcije aplikacije u `BEGIN`/`ROLLBACK`; namerni prekršaji u
  `SAVEPOINT`. Pokriva: unos iz kataloga / slobodan unos, oba CHECK-a, oba jedinstvena indeksa,
  reaktivaciju uklonjenog reda, soft delete, `confirmStack`, `clearStack`, kaskadno brisanje sa
  profilom, admin agregat (spojeni unosi, zastareli izuzeti, prag „< 3", `lower()` spajanje
  slobodnih naziva), `mergeCustomSupplement` (nepostojeći ključ odbijen).
- **`qa-dates`**: `needsConfirmation` — granice 6/7/8 dana, prelaz DST-a, prazan stack, više redova
  sa različitim datumima.
- **`qa-routes`**: `/stack` i `/admin/stack` klasifikovani; nema novih `/api` ruta.
- **`EXPECTED_SCHEMA`** pokriva sve što uvodi `0005`.
- Pre commita: `npm run qa` + `npm run build`.

## Redosled isporuke

1. Migracija `0005`, `schema.ts`, `EXPECTED_SCHEMA`, katalog
2. Zod šeme, akcije, `confirm-rules`, `qa-sql` i `qa-dates` sekcije
3. `/stack` UI + kartica na dashboardu
4. `/admin/stack` + `lib/admin/stack.ts`
5. Ažuriranje `CLAUDE.md` (migracija `0005`, nove konvencije), README-a i `STATUS.md`

## Otvorena pitanja

- Konačna lista kataloga (~30 stavki) — potvrđuje Vladimir.
- Tekst politike privatnosti na `nurolab.rs` — van repoa, odgovornost Vladimira.
- Ako nedeljna potvrda ima nisku stopu odziva: razmotriti push kroz postojeći dispatcher (Faza 2+).
