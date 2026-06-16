# ZenFlow App — Plan implementacije

**Proizvod:** ZenFlow companion aplikacija (PWA) · **Brend:** NuroLab
**Verzija plana:** 1.0 · **Format:** za kopiranje i A4 štampu

---

## Kako koristiti ovaj plan

Plan je podeljen na tri faze: **Faza 0 (Postavka)**, **Faza 1 (MVP)** i **Faza 2 (proširenja)**. Koraci su poređani po redosledu izrade — kasniji koraci zavise od ranijih. Svaki korak ima isti format:

- **Opis** — šta i zašto radimo.
- **Zadaci** — konkretni pod-koraci.
- **Rezultat** — šta postoji kada je korak gotov (definicija gotovog).

Preporuka: jedan korak = jedan ili više Git commit-ova / jedan task u trackeru.

---

## Preduslovi (nalozi i pristupi pre Faze 0)

Otvoriti i pripremiti pre početka:

1. **GitHub** repo (privatni) za kod.
2. **Vercel** nalog (hosting + cron) povezan sa GitHub repo-om.
3. **Neon** nalog (Postgres baza).
4. **Clerk** nalog (autentifikacija).
5. **Resend** nalog (email) + verifikovan domen za slanje (npr. `mail.nurolab.rs`).
6. **WooCommerce** pristup: admin shopa + generisani REST API ključevi (consumer key/secret) i mogućnost dodavanja webhook-a.
7. **Stripe** nalog preko američke firme (potreban tek u Fazi 2).
8. **Domen/subdomen** `app.nurolab.rs` (DNS pristup radi povezivanja na Vercel).
9. **Brend materijali** — boje, Hanken Grotesk font, logo (iz postojećih stranica).

---

# FAZA 0 — Postavka projekta

Cilj: spreman skelet aplikacije, deploy radi, sve osnovne integracije povezane.

### Korak 0.1 — Inicijalizacija projekta
- **Opis:** Postaviti Next.js (App Router) projekat sa TypeScript-om kao osnovu.
- **Zadaci:**
  - `create-next-app` sa TypeScript, App Router, ESLint.
  - Postaviti strukturu foldera (`app/`, `components/`, `lib/`, `db/`, `emails/`).
  - Dodati Prettier + ESLint pravila, `.env.example`, `README`.
  - Inicijalni commit i push na GitHub.
- **Rezultat:** Prazan Next.js app se pokreće lokalno (`npm run dev`).

### Korak 0.2 — Stilizovanje i brend tokeni
- **Opis:** Tailwind sa NuroLab brend tokenima i Hanken Grotesk fontom — temelj celog vizuelnog identiteta.
- **Zadaci:**
  - Instalirati i konfigurisati Tailwind CSS.
  - U `tailwind.config` dodati boje (paper, ink, slate, slate-mid, slate-soft, lime, lime-deep, lime-soft, mint), radijuse (20/28px), senke (soft, lift) i `fontFamily` Hanken Grotesk.
  - Ubaciti Hanken Grotesk (preko `next/font` ili `@fontsource`) sa težinama 300–700.
  - Globalni stil: paper pozadina, ink tekst, eyebrow/heading klase, pill dugmad (`btn-dark`, `btn-lime`, `btn-ghost`).
- **Rezultat:** Test stranica prikazuje brend boje, font i dugmad ispravno.

### Korak 0.3 — UI komponente (shadcn/ui)
- **Opis:** Bazne komponente prebojene u ZenFlow stil radi bržeg razvoja.
- **Zadaci:**
  - Inicijalizovati shadcn/ui.
  - Mapirati temu na brend tokene (radijusi, boje, senke).
  - Pripremiti osnovne komponente: Button, Card, Input, Dialog, Toast, Tabs.
- **Rezultat:** Biblioteka komponenti u brendu, spremna za korišćenje.

### Korak 0.4 — Baza i ORM
- **Opis:** Postgres baza na Neon-u i Drizzle ORM sa šemama iz PRD-a.
- **Zadaci:**
  - Kreirati Neon bazu, dodati `DATABASE_URL` u env.
  - Postaviti Drizzle (config, klijent).
  - Definisati šeme: `profiles`, `orders`, `protocol_logs`, `supply`, `focus_sessions`, `daily_tasks`, `badges`, `push_subscriptions`, `notifications_log`, `focus_quiz_results`.
  - Generisati i pokrenuti prvu migraciju.
- **Rezultat:** Sve MVP tabele postoje u bazi; migracije rade.

### Korak 0.5 — Autentifikacija (Clerk)
- **Opis:** Login/registracija, sesije i role (admin/user).
- **Zadaci:**
  - Integrisati Clerk (provider, sign-in/sign-up stranice u brend stilu).
  - Postaviti `middleware.ts` za zaštitu ruta.
  - Definisati role preko Clerk `publicMetadata` (`role: admin | user`); zaštititi `/admin` rute.
  - Pomoćne funkcije za čitanje korisnika i role u server akcijama.
- **Rezultat:** Korisnik može da se prijavi; admin rute su nedostupne običnom korisniku.

### Korak 0.6 — Deploy i okruženje
- **Opis:** Aplikacija živi na Vercelu, povezana na subdomen.
- **Zadaci:**
  - Povezati GitHub repo sa Vercelom (auto-deploy na `main`).
  - Uneti sve env varijable (Neon, Clerk, kasnije Resend/WooCommerce).
  - Povezati `app.nurolab.rs` (DNS) na Vercel.
- **Rezultat:** Produkcioni URL radi, login funkcioniše online.

### Korak 0.7 — Email (Resend)
- **Opis:** Slanje transakcionih mejlova iz aplikacije.
- **Zadaci:**
  - Integrisati Resend SDK, dodati API ključ u env.
  - Verifikovati domen za slanje (SPF/DKIM).
  - Napraviti osnovni email layout u brendu (React Email ili HTML šablon).
  - Test: poslati probni mejl.
- **Rezultat:** Aplikacija uspešno šalje mejl iz brendiranog šablona.

### Korak 0.8 — PWA skelet (Serwist)
- **Opis:** Aplikacija je instalabilna i radi offline na osnovnom nivou.
- **Zadaci:**
  - Integrisati Serwist (service worker, caching strategija).
  - Napraviti `manifest.json` (ime, ikonice, boje teme, standalone display).
  - Dodati set ikonica (192/512, maskable) i splash.
  - Test instalacije na Android/desktop; proveriti offline shell.
- **Rezultat:** „Add to Home Screen" radi; app se otvara kao standalone.

### Korak 0.9 — Konvencije i osnovni layout
- **Opis:** Zajednički app layout (navigacija, zaštićene zone) i konvencije koda.
- **Zadaci:**
  - Napraviti glavni app layout (bottom nav / sidebar u brendu).
  - Definisati zaštićene rute (user) i `/admin` zonu.
  - Postaviti strukturu za server akcije i validaciju (npr. zod).
- **Rezultat:** Postoji navigacioni skelet kroz koji se kreće kroz (prazne) ekrane.

---

# FAZA 1 — MVP

Cilj: kompletna petlja „doslednost + ponovna kupovina" + admin. Funkcionalna aplikacija za VIP korisnike.

### Korak 1.1 — Sinhronizacija porudžbina (WooCommerce)
- **Opis:** Porudžbine iz WooCommerce-a moraju da stignu u bazu da bi verifikacija pristupa radila.
- **Zadaci:**
  - Napraviti API rutu za webhook (`order.created` / `order.completed`) sa proverom potpisa.
  - Upsert porudžbine u `orders` (mejl, tip proizvoda `full`/`refill`, količina, kapsule, datum).
  - Mapiranje proizvoda u `full` vs `refill` po SKU/ID (konfiguracija).
  - Backfill postojećih porudžbina preko WooCommerce REST API-ja.
  - U WooCommerce-u registrovati webhook ka produkcionoj ruti.
- **Rezultat:** Nova porudžbina automatski ulazi u bazu; istorijske porudžbine učitane.

### Korak 1.2 — Logika pristupa (`access_status`)
- **Opis:** Automatsko određivanje VIP/inactive statusa na osnovu poslednje porudžbine (prozor 60 dana).
- **Zadaci:**
  - Funkcija koja računa status iz datuma poslednje porudžbine za dati mejl.
  - Osvežavanje statusa pri svakom webhook-u i pri loginu.
  - Vercel Cron posao (npr. dnevno) koji prebacuje istekle VIP u `inactive`.
- **Rezultat:** Status korisnika je tačan i sam se održava.

### Korak 1.3 — Registracija i verifikacija porudžbine
- **Opis:** Korisnik se registruje mejlom porudžbine; app proverava da li mejl postoji u `orders`.
- **Zadaci:**
  - Clerk webhook `user.created` → kreiranje `profiles` reda.
  - Verifikacija: poklapanje mejla sa `orders`; dodela `access_status`.
  - Ekran za slučaj da mejl nije pronađen (uputstvo / kontakt).
- **Rezultat:** Samo kupci sa važećom porudžbinom dobijaju pristup; profil se kreira.

### Korak 1.4 — Onboarding
- **Opis:** Prvi ulazak — postavljanje protokola i baseline-a.
- **Zadaci:**
  - Setup protokola: broj pakovanja + datum početka → izračun datuma isteka zaliha.
  - Podešavanje vremena jutarnje i večernje doze (i podsetnika).
  - Focus Score kviz (baseline) — pitanja, skor, upis u `focus_quiz_results`.
  - Zahtev za dozvolu za notifikacije.
- **Rezultat:** Korisnik završava onboarding; protokol i podsetnici su podešeni.

### Korak 1.5 — Protokol tracker (jezgro)
- **Opis:** Dnevni habit tracker sa nizom — srce aplikacije.
- **Zadaci:**
  - Dnevni check-in za 2 doze (jutro/veče), jedan tap, upis u `protocol_logs`.
  - Logika niza (streak): brojanje uzastopnih dana, prekid, najduži niz.
  - Kalendar/heatmap doslednosti (mesečni pregled).
  - „Kriva fokusa" — grafik kumulativnih dana protokola (Recharts).
- **Rezultat:** Korisnik beleži doze, vidi niz, heatmap i krivu fokusa.

### Korak 1.6 — Zalihe
- **Opis:** Praćenje preostalih kapsula i predviđanje isteka.
- **Zadaci:**
  - Izračun preostalih kapsula iz kupljene količine i logovanih doza.
  - Predviđanje datuma isteka na osnovu ritma uzimanja.
  - Prikaz statusa zaliha na dashboard-u.
- **Rezultat:** Korisnik u svakom trenutku vidi koliko mu je ostalo i kada ističe.

### Korak 1.7 — Notifikacioni sistem
- **Opis:** Push i email podsetnici — uključujući kritičnu „dokupi refill" poruku.
- **Zadaci:**
  - Web Push: generisati VAPID ključeve, čuvati subscription u `push_subscriptions`, slanje notifikacija.
  - Email šabloni (Resend, u brendu): dobrodošlica, zalihe na izmaku (dokup refill), nedeljni rezime.
  - Vercel Cron poslovi: jutarnja doza, večernja doza, niz u opasnosti, zalihe na izmaku (~5 dana pre), nedeljni rezime.
  - „Dokupi refill" poruka (push + email) sa CTA na WooCommerce refill proizvod i framing-om „nemoj da prekineš niz".
  - Logovanje poslatih notifikacija u `notifications_log` (izbegavanje duplikata).
- **Rezultat:** Korisnik dobija podsetnike na vreme; dokup poruka stiže i kao push i kao mejl.

### Korak 1.8 — Alati za fokus
- **Opis:** Pomodoro tajmer i dnevni fokus zadaci.
- **Zadaci:**
  - Pomodoro tajmer (podesivi intervali rad/pauza), upis sesija u `focus_sessions`.
  - Povezivanje jutarnjeg „deep work bloka" sa jutarnjom dozom (copy/kontekst).
  - „3 najvažnija zadatka danas" — unos i obeležavanje (`daily_tasks`).
- **Rezultat:** Korisnik može da pokrene fokus sesiju i vodi dnevne zadatke.

### Korak 1.9 — Dashboard i bedževi
- **Opis:** Centralni pregled napretka + osnovna gamifikacija.
- **Zadaci:**
  - Dashboard: dani protokola, doslednost %, trenutni niz, status zaliha.
  - Osnovni bedževi: 7 dana, 15 dana (1 pakovanje), 30 dana (pun protokol), prva fokus sesija; upis u `badges`.
- **Rezultat:** Korisnik na jednom ekranu vidi sve ključne metrike i osvojene bedževe.

### Korak 1.10 — Admin panel
- **Opis:** Alat za NuroLab tim (admin rola).
- **Zadaci:**
  - Lista korisnika sa `access_status`, doslednošću i statusom zaliha.
  - Pregled porudžbina i statusa WooCommerce sync-a.
  - Ručno slanje/ponovno slanje „dokupi" mejla.
  - Osnovne metrike: aktivni korisnici, prosečna doslednost, korisnici pri kraju zaliha.
- **Rezultat:** Admin može da prati korisnike i ručno pokrene dokup mejl.

### Korak 1.11 — PWA poliranje
- **Opis:** Doterivanje instalabilnosti i offline ponašanja.
- **Zadaci:**
  - Custom install prompt (i uputstvo za iOS „Add to Home Screen").
  - Offline stanje za ključne ekrane; caching strategija za statiku.
  - Provera push-a na instaliranoj PWA (posebno iOS 16.4+).
- **Rezultat:** App deluje kao nativna; instalacija i offline glatki.

### Korak 1.12 — Bezbednost, QA i lansiranje
- **Opis:** Provera kvaliteta, bezbednosti i privatnosti pre puštanja.
- **Zadaci:**
  - Autorizacija na svakoj API ruti (Clerk sesija + provera `access_status`/role).
  - Politika privatnosti, brisanje naloga i izvoz podataka; zdravstveni disklejmer u onboarding-u i uvidima.
  - QA na realnim uređajima (Android/iOS/desktop), testiranje notifikacija i cron poslova.
  - Lansiranje za VIP korisnike + osnovni monitoring grešaka.
- **Rezultat:** MVP je u produkciji, bezbedan i testiran, dostupan VIP korisnicima.

---

# FAZA 2 — Proširenja

Cilj: wellness sloj, edukacija, napredni uvidi i naplata pretplate za ne-kupce.

### Korak 2.1 — Wellness
- **Opis:** Alati za mentalno zdravlje i samoposmatranje.
- **Zadaci:**
  - Vežbe disanja (box breathing animacija).
  - Kratke vođene meditacije (2–10 min).
  - Mood & energija check-in (jutro/veče) → `mood_checkins`.
  - Mikro-journaling → `journal_entries`.
  - (Opciono) san i hidratacija.
- **Rezultat:** Korisnik ima alate za smirivanje i beleženje stanja.

### Korak 2.2 — Edukacija i gamifikacija
- **Opis:** Sadržaj koji objašnjava protokol + proširena motivacija.
- **Zadaci:**
  - Mini biblioteka (protokol, sastojci, fokus tehnike) → `content_items`.
  - Dnevni fokus-tip.
  - Prošireni bedževi i milestone-ovi.
- **Rezultat:** Korisnik uči o protokolu i ima više razloga da se vraća.

### Korak 2.3 — Napredni uvidi
- **Opis:** Dublja analitika napretka.
- **Zadaci:**
  - Focus Score trend (re-kviz na ~30 dana).
  - Trend raspoloženja i fokusa.
  - 30-dnevni izveštaj (email) — tempiran na kraj punog protokola.
  - Soft korelacije (bez medicinskih tvrdnji).
- **Rezultat:** Korisnik vidi napredak kroz vreme; izveštaj podstiče dokup.

### Korak 2.4 — Pretplata (Stripe)
- **Opis:** Naplata mesečne članarine za korisnike koji nisu kupili ZenFlow.
- **Zadaci:**
  - Stripe (preko US firme): proizvodi/cene, Checkout.
  - Webhook za status pretplate → stanje `subscriber` u `subscriptions`/`profiles`.
  - Gating pristupa: VIP (besplatno) vs subscriber (plaćeno) vs inactive.
  - Upravljanje pretplatom (otkaz, obnova) i odgovarajući mejlovi.
- **Rezultat:** Ne-kupci mogu da se pretplate i koriste app; pristup je ispravno gejtovan.

### Korak 2.5 — Dodatni fokus alati
- **Opis:** Završni sloj alata za fokus i personalizaciju.
- **Zadaci:**
  - Ambijentalni zvuci (brown/white noise, lo-fi).
  - Fokus mod (DND podsetnik + sesija preko celog ekrana).
  - Ciljevi korisnika i personalizovane poruke.
- **Rezultat:** Bogatiji fokus modul i personalizovano iskustvo.

---

## Definicija gotovog po fazama

- **Faza 0:** App se deplojuje, login radi, baza i integracije povezane, PWA instalabilna.
- **Faza 1 (MVP):** VIP korisnik može da se registruje, prati protokol, vidi niz i zalihe, prima podsetnike i „dokupi" poruke; admin ima pregled i ručni mejl.
- **Faza 2:** Wellness, edukacija, napredni uvidi i Stripe pretplata su uživo.

## Napomene o zavisnostima

- 1.3 zavisi od 1.1 i 1.2 (verifikacija traži porudžbine i logiku statusa).
- 1.7 zavisi od 0.7 (Resend) i 0.8 (PWA/push).
- 2.4 zavisi od završene US firme i Stripe naloga.

---

*Kraj plana — v1.0 · NuroLab · ZenFlow App*
