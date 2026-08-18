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
namerno nije u `vercel.json` jer su vremena doza individualna, pa mora da se zove na 15 min. To radi
**eksterni scheduler** (cron-job.org). Setup: [`docs/cron-setup.md`](./cron-setup.md).

Dijagnostika prijavljuje `Dose reminderi ikad poslati: ❌ nijedan` kad scheduler nije podešen.

Ručna provera da ruta radi:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://app.nurolab.rs/api/cron/notifications
# 401 → CRON_SECRET ne odgovara (ili nije postavljen na Vercelu)
# 200 {"now":"HH:mm","morning":0,...} → ruta radi; nule su normalne van prozora doze
```

Podsetnik se šalje samo ako je **trenutno beogradsko vreme u prozoru `[vreme doze, +30min)`**, doza
još nije označena, korisnik nije `inactive` i završio je onboarding. Za test pomeri vreme doze u
Podešavanjima par minuta unapred i sačekaj sledeći run schedulera.

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
