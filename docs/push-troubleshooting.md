# Push notifikacije ne stižu — dijagnostika

Lanac ima pet karika i puca tiho na svakoj. Idi redom; prva provera obično da odgovor.

## 0. Pokreni dijagnostiku

Kao ulogovan admin otvori **`/admin` → kartica „Test push notifikacije" → „Dijagnostika push-a"**
(radi i sa telefona), ili direktno:

```bash
curl -s https://app.nurolab.rs/api/admin/push/diagnose -H "Cookie: <tvoj session cookie>" | jq
```

Vraća `verdict` (`ok` / `blokirano`) i listu `blockers` sa konkretnim uputstvom. Ako je `verdict: ok`
a notifikacija i dalje ne stiže, kreni na korak 4 i 5.

## 1. VAPID par se ne poklapa (najčešći tihi otkaz)

**Simptom:** pretplata postoji, kod ne puca, ništa ne stiže. Push servis vraća **403** na svako slanje.

**Uzrok:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` se ugrađuje u **klijentski bundle na build-u** i njime browser
pravi pretplatu. `VAPID_PRIVATE_KEY` potpisuje slanje na serveru. Ako nisu iz istog para — jer je par
regenerisan, ili je samo jedan ažuriran na Vercelu, ili je javni ključ postavljen **posle** poslednjeg
build-a — potpis ne prolazi.

**Provera:** dijagnostika prijavljuje `VAPID par: ❌ NE poklapa se`. Lokalno:

```bash
node -e "
const c=require('crypto'),d=s=>Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'),'base64');
const e=c.createECDH('prime256v1'); e.setPrivateKey(d(process.env.VAPID_PRIVATE_KEY));
console.log(e.getPublicKey().equals(d(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)) ? 'OK' : 'NE POKLAPA SE');
"
```

**Popravka:** generiši nov par i postavi **oba** ključa, pa **obavezno redeploy** (bez redeploy-a
javni ključ u bundle-u ostaje stari):

```bash
npx web-push generate-vapid-keys
```

Postojeće pretplate napravljene starim javnim ključem su **neupotrebljive** — korisnici moraju da
isključe pa uključe podsetnike (ili obriši `push_subscriptions` da se svi ponovo pretplate).

## 2. Nema pretplate u bazi

**Simptom:** dijagnostika prijavljuje `Pretplate: 0`.

Toggle je tražio dozvolu ali pretplata nije upisana, ili nikad nije ni uključen. Proveri:

- Da li je `NEXT_PUBLIC_VAPID_PUBLIC_KEY` uopšte bio postavljen **u trenutku build-a**? Ako nije,
  `subscribeToPush()` odmah vrati „Push nije konfigurisan" i ne pravi pretplatu.
- Da li je dozvola odbijena? Jednom odbijena dozvola se u browseru pamti — mora ručno da se resetuje
  u podešavanjima sajta.

## 3. iOS: app nije instaliran

Na iPhone-u/iPad-u Web Push radi **isključivo iz instalirane aplikacije** (iOS 16.4+). U Safariju
`Notification` uopšte ne postoji, pa toggle nema šta da ponudi — zato se prikazuje banner
„Dodaj na početni ekran" (`components/push/ios-install-hint.tsx`).

Redosled je bitan: **prvo** Share → Add to Home Screen, **pa** otvori app sa početnog ekrana, **pa**
uključi podsetnike. Uključivanje u Safariju pre instalacije ne radi.

## 4. Test push stiže, ali podsetnici za doze ne

**Ovo je odvojen problem.** Podsetnike šalje `/api/cron/notifications`, koji **Vercel NE pokreće** —
namerno nije u `vercel.json` jer su vremena doza individualna, pa mora da se zove na 15 min.

Scheduler je GitHub Actions workflow u repou
([`.github/workflows/notifications-dispatcher.yml`](../.github/workflows/notifications-dispatcher.yml)) —
radi čim dodaš `CRON_SECRET` kao repo secret. Puna uputstva (i cron-job.org alternativa):
[`docs/cron-setup.md`](./cron-setup.md).

Dijagnostika ima **dry-run**: za ulogovanog admina računa — istim funkcijama koje koristi i cron
(`lib/push/dispatch-rules.ts`) — da li bi podsetnik bio poslat **baš sada**, i ako ne bi, zašto
(onboarding nije završen, nalog je `inactive`, vreme nije podešeno, doza je već uzeta, dedup, ili je
trenutno vreme van prozora). Prikazuje i sam prozor, npr. `08:00–08:30`.

Ako dry-run kaže **„Poslao bi podsetnik odmah"** a nijedan podsetnik nikad nije zabeležen, zaključak
je jednoznačan: **ruta se ne poziva** — scheduler nije podešen ili gađa pogrešan URL/header.

Ručna provera da ruta radi:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://app.nurolab.rs/api/cron/notifications
# 404 → ruta nije u PUBLIC_ROUTES (lib/route-config.ts), pa je `auth.protect()` presreo.
#       Clerk za ne-HTML zahteve vraća 404 umesto 401, pa izgleda kao da ruta ne postoji.
# 401 → CRON_SECRET ne odgovara (ili nije postavljen na Vercelu)
# 200 {"totals":{"sent":0,...},"byType":{...}} → ruta radi; nule su normalne van prozora doze
```

Odgovor je razložen po tipu (`byType`), pa se iz njega vidi i **zašto** nešto nije poslato:
`skippedDedup` (već obavešten danas), `skippedNoSubscription` (nema pretplatu), `skippedNoStreak`
(streak je 0), `failed` (push servis odbio). `schedule.gapMissedWindow: true` znači da je scheduler
propustio ceo prozor — vidi „Alert kad dispatcher ćuti" u [`docs/cron-setup.md`](./cron-setup.md).

Podsetnik se šalje samo ako je **trenutno beogradsko vreme u prozoru
`[vreme doze, +NOTIFICATION_WINDOW_MIN)`** (default **45 min**), doza još nije označena, korisnik
nije `inactive` i završio je onboarding. Za test pomeri vreme doze u Podešavanjima par minuta
unapred i sačekaj sledeći run schedulera.

**Zašto prozor, a ne tačno vreme:** dispatcher se budi periodično i ne može da pogodi minut u minut,
pa hvata sve kojima je vreme doze palo unutar prozora. Preciznost isporuke određuje **kadenca**
(15 min), a prozor je **rezerva za kašnjenje schedulera** — GitHub Actions `schedule` kasni 10–20 min
i ume da preskoči run, pa 45 pokriva „jedan preskočen run + do 15 min kašnjenja". Pravilo:
pokrivenost je potpuna dok je stvaran razmak između dva poziva ≤ prozor.

Prozor je clamp-ovan da ne pređe ponoć: pri prozoru 45 doza podešena posle **23:15** dobija
podsetnik u prozoru `23:15–00:00`, dakle ranije nego što je podešeno. Bez toga prozor za tako kasnu
dozu nijedan tick ne bi mogao da pogodi (`nowMin` se u ponoć resetuje na 0) i podsetnik ne bi stigao
nikad.

## 5. Slanje puca sa drugim statusom

Dijagnostika i toast na „Pošalji test push" sada prikazuju **stvarni HTTP status** push servisa:

| Status | Značenje | Šta uraditi |
|---|---|---|
| 400 | Loš zahtev | Proveri `VAPID_SUBJECT` (mora `mailto:` ili `https://`) |
| 401 / 403 | VAPID potpis odbijen | Korak 1 — par se ne poklapa |
| 404 / 410 | Pretplata više ne postoji | Red se automatski briše; pretplati se ponovo |
| 413 | Payload prevelik | Skrati `title`/`body` |
| 429 | Rate limit | Sačekaj i pokušaj ponovo |

Puni log je u `notifications_log` (`channel: 'push'`, `status: 'failed'`) i u Vercel logovima
pod prefiksom `[push]`.

## 6. Push je radio pa je prestao (rotacija endpoint-a)

Push servis sme u svakom trenutku da poništi endpoint i izda nov — Chrome to radi posle dužeg
nekorišćenja, promene profila ili restore-a uređaja. Browser o tome javlja **samo** kroz događaj
`pushsubscriptionchange` u service worker-u.

Simptom je najgori mogući: nema greške, nema poruke, podsetnici prosto prestanu. U bazi ostaje
mrtav red koji na svako slanje vraća 410 (u dijagnostici: `recentPushFailures` raste, `sent` je 0).

Pokriveno je u dva sloja:

1. **`pushsubscriptionchange` u `app/sw.ts`** — SW napravi novu pretplatu istim VAPID ključem i
   POST-uje par `(stari endpoint, nova pretplata)` na `/api/push/rotate`. Ruta iz **starog
   endpoint-a** izvodi vlasnika (nikad iz tela zahteva), premesti pretplatu i obriše staru — sve
   u jednoj SQL izjavi.
2. **`syncPushSubscription` na ulasku u app** (`components/push/push-sync.tsx`) — re-upsert
   postojeće pretplate. Postoji jer `pushsubscriptionchange` nije garantovan: browser ume da ga
   propusti, SW može biti ubijen, a neki browseri ga isporuče bez `oldSubscription`, pa server
   ne zna koju pretplatu da premesti.

### Ručni test u Chrome DevTools

`pushsubscriptionchange` se ne može okinuti dugmetom — nema ga u DevTools UI-u. Testira se tako što
se **simulira sam događaj** iz SW konzole:

1. Otvori app na **HTTPS** buildu (`npm run build && npm start` ili preview deploy) — SW je ugašen
   u dev modu.
2. `F12` → **Application** → **Service workers**. Uključi **Update on reload** i proveri da je
   aktivan `sw.js` iz ovog builda (ako nije, „Unregister" pa reload).
3. Uključi push u Podešavanjima i zapamti trenutni endpoint. U konzoli **stranice**:
   ```js
   const r = await navigator.serviceWorker.ready
   const s = await r.pushManager.getSubscription()
   console.log(s.endpoint)
   ```
4. U **Service workers** panelu klikni na link pored „Source" da otvoriš konzolu **service worker-a**
   (bira se u dropdown-u za kontekst — mora biti `sw.js`, ne `top`). Tamo okini događaj:
   ```js
   const oldSub = await self.registration.pushManager.getSubscription()
   await oldSub.unsubscribe()                       // simulira poništenje kod push servisa
   self.dispatchEvent(Object.assign(
     new Event('pushsubscriptionchange'),
     { oldSubscription: oldSub, newSubscription: null },
   ))
   ```
   `Event` se koristi jer se `PushSubscriptionChangeEvent` ne može konstruisati sa pravim
   pretplatama; handler čita samo `oldSubscription` / `newSubscription`, pa je ovo verna simulacija.
5. U **Network** tabu SW konteksta mora da se pojavi `GET /api/push/rotate` (dohvat VAPID ključa,
   samo ako `oldSubscription.options` nije dostupan) i `POST /api/push/rotate` sa odgovorom
   `{"rotated":true,"removed":1,"reason":"rotated"}`.
6. Potvrdi da je endpoint promenjen i da je u bazi tačno **jedan** red:
   ```js
   const s2 = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
   console.log(s2.endpoint)   // različit od onog iz koraka 3
   ```
   pa u `/admin` → „Dijagnostika push-a" proveri `subscriptions.count: 1` i `lastSeenAt` od
   maločas. Na kraju pošalji test push da potvrdiš da stiže na nov endpoint.

**Šta znače ostali odgovori rute:**

| `reason` | Značenje |
|---|---|
| `rotated` | Pretplata premeštena, stari red obrisan |
| `unknown_endpoint` | Stari endpoint nije u bazi (već rotiran, ili pretplata nikad nije sačuvana) — namerno se ne radi ništa |
| `endpoint_taken` | Novi endpoint već pripada **drugom** nalogu; tuđi red se ne dira (vidi „deljen uređaj" u `push-actions.ts`) |

Ruta uvek vraća **200** — SW nema kome da prijavi grešku, a 4xx bi ga terao na beskonačne pokušaje.
