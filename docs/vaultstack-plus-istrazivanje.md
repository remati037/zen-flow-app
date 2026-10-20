# VaultStack+ — istraživanje konkurencije i zaključci

Datum: 2026-10-20 · Status: istraživanje (pre dizajna) · Jezik: srpski

## 1. Odluke do sada

| Pitanje | Odluka |
|---|---|
| Gde živi | **Novi, odvojeni javni app** (ne proširenje NuroLab PWA) |
| Tržište i jezik | **Balkan, srpski** (engleski eventualno kasnije) |
| Model prihoda | **Tvoji proizvodi su glavni kanal** (ZenFlow, Nuve gumene bombone, buduća NuroLab linija — cela marža). **Affiliate je dopuna** samo za suplemente koje ne prodaješ. |
| Cena za korisnika | Potpuno besplatan, bez pretplate |
| Pristup | A kao jezgro (tracker + zalihe + „Dopuni"), SEO stranice po suplementu u kasnijoj fazi |

Veza sa postojećim radom: u repou već postoje spec i plan za „Moj stack" (100 suplemenata, srpski aliasi, pretraga, admin agregat). Katalog i pravila pretrage mogu se preuzeti.

## 2. Pregled konkurenata

Izvori su uglavnom App Store listinzi, agregatori i marketinški roundup-i firmi koje i same prodaju aplikacije. Brojke preuzimanja nisu dostupne, pa ovo nije rang po veličini.

| App | Jezgro | Model i cena | Free granica |
|---|---|---|---|
| SuppCo | Skener bar-koda, baza ~250.000 proizvoda, SuppScore | Pretplata $39.99–59.99, „Buying Club" $119.99 | praćenje i podsetnici |
| SuppTrack | Shelf + raspored, podsetnici | $14.99 god. / lifetime $59.99, 7 dana trial | nije jasno |
| Supplements AI | Planiranje razmaka doza, detekcija nedostataka | $29.99–39.99 god. (ili $4.99–5.99 mes.) | nije jasno |
| Supplemate | Log, podsetnici, provera interakcija | $4.99 mes. / $19.99 god. | neograničen broj suplemenata |
| Supplify | Čist dnevni log | $19.99 god., lifetime od $17.99 | 2 suplementa dnevno |
| SupStack | AI analiza celog stack-a | $9.99 mes. | 2 suplementa, 7 dana istorije |
| Optimize | Korelacije sa raspoloženjem/energijom | Mesečna pretplata (nepotvrđeno) | — |
| Medisafe, Cronometer | Lekovi / mikronutrijenti | Pretplata | nisu direktni konkurenti |
| **VaultStack** | Rotacija stack-a, skener, 4 doba dana, zalihe, „dopuni" link ka Amazonu, lokalni podaci | **Besplatan, reklame** | sve |
| Supplement Tracker: Vitamin | Log | Besplatan, opcioni tips $0.99–9.99, bez reklama | sve |

**VaultStack je mali:** Android, izašao 16.5.2026, ~100 instalacija, nema ocena (AppGoblin procena, ne podatak razvijača). Njegov model „besplatno + refill link" je neproveren, ne dokazan.

## 3. Šta važi na tržištu

- **Free granica** je skoro uvek broj suplemenata (2), dubina istorije (7 dana) i napredne funkcije. Unos i podsetnici su gotovo uvek besplatni.
- **Iza paywall-a:** AI analiza i interakcije, zalihe sa upozorenjem o isteku, puna istorija i analitika, custom kombinacije.
- **Pretplata je dominantan model** (7 od 10 aplikacija, $15–40 godišnje, često uz lifetime).
- **Affiliate:** nijedan listing ne potvrđuje affiliate proviziju. Pomeni su samo VaultStack (Amazon refill link, nepotvrđeno da je affiliate) i SuppCo (nova prodavnica, provizija nepotvrđena). U ovoj niši je affiliate praktično neiskorišćen.

## 4. Šta korisnici mrze (indicije, ne statistika)

Uzorak je mali. Reddit (r/Supplements, r/Nootropics, r/Biohackers) i Trustpilot nisu pokriveni.

1. Netačni ili nedosledni podaci i skor — SuppScore se menja i kad se stack ne menja; sumnja u pristrasnost ka „trusted" brendovima (SuppCo).
2. Pretplata skupa za ono što nudi, ili je free nivo preuzak (Supplements AI, Supplify).
3. Nepotpuna baza i spor „match" za nove ili male brendove.
4. Fali barkod skener (Supplements AI; developer kaže da je u izradi).
5. Naplata bez grejs perioda posle otkazivanja.
6. Bagovi u free nivou bez poruke zašto (Supplify: dugme „dodaj" ne radi).
7. Problemi sa nalogom i sinhronizacijom (SuppCo).

Nisu nađene žalbe na reklame niti UX u užem smislu (to ne znači da ne postoje).

## 5. Šta korisnici traže

1. **Dnevni trošak stack-a i lak rebuy** (Supplements AI recenzija).
2. Skener koji uvozi nove brendove.
3. Pouzdan i objašnjiv skor bez pristrasnosti prema brendu.
4. Veća baza i brz match nepoznatih proizvoda.
5. Transparentna naplata sa grejs periodom i jasnom porukom šta je zaključano.

## 6. Reverse: gde je naša prednost

| Slabost konkurenta | Naš potez |
|---|---|
| Free limit od 2 suplementa | Besplatno, bez limita |
| Pretplata i nejasna naplata | Nema pretplate |
| Nepoverljiv skor, pristrasnost ka brendovima | Bez ocenjivanja brendova. Katalog je neutralan, a oznaka „NuroLab" i „sponzorisano" je vidljiva |
| Trošak i ponovna kupovina fale | Zalihe, trošak stack-a i „Dopuni" kao glavna funkcija |
| Mala baza, engleski | Srpski katalog sa aliasima (100 stavki već postoji) |

**Svesno izostavljeno iz MVP-a:**
- Skener bar-koda (traži bazu proizvoda).
- AI analiza i interakcije (pravni rizik, a korisnici već prijavljuju netačnost kod SuppCo).

## 7. Affiliate za Srbiju / Balkan

Web-only istraživanje, bez pristupa Awin/Admitad panelu. Ono što nije nađeno ne znači da ne postoji.

**Potvrđeno — iHerb (Awin „iHerb ROW"):**
- Dostava u Srbiju iz SAD (FedEx/DHL). Uvozni PDV 20% plaća kupac; do 50 € nema carine.
- Provizija 5% podrazumevano, 1% za kupon sajtove, „do 25%" u ograničenim akcijama.
- Cookie **7 dana**. Brand bidding je zabranjen. Nema provizije na porudžbine sa Rewards kodom.
- Deferred deeplinking za aplikacije nije podržan, ali običan web link radi (za PWA je to u redu).
- Nepotvrđeno: 10% za nove partnere prva tri meseca; 30/45-dnevni cookie iz agregatora (kosi se sa Awin-ovih 7 dana).
- Rewards kod kupca je odvojen od affiliate programa i može da pregazi affiliate klik.

**Nepoznato (nije nađen javni program):** Benu, Dr.Max, Lilly, Filly, Supplement Store, Myprotein za Srbiju, Bulk, Hrana za mišiće. GymBeam radi u Srbiji, ali affiliate programi su mu navedeni samo za AT/CH/DE/IT/PL (Awin) i BG/CZ/SK (Dognet), bez Srbije.

**Verovatno neupotrebljivo:** Amazon Associates (Srbija nije na listi država, podatak iz 2021, nepotvrđen zvanično), Thorne (uslovi traže stanovnika SAD). Momentous i AG1: nepoznato.

**Rangirana preporuka — sa kim prvo:**
1. iHerb preko Awin-a (prijava odmah moguća). Za tracking koristi Awin link builder, ne samo UTM.
2. Direktno pitati Benu, Dr.Max i GymBeam Srbija da li imaju partnerski program.
3. Proveriti Myprotein (Awin) za Srbiju/CEE.
4. Thorne, Momentous, AG1, Amazon: preskočiti.

**Realna procena:** plan prihoda ne praviti dok ne vidiš ugovor. Pretpostavka je 5–10% provizije i 7–30 dana cookieja.

## 8. Pravila i rizici (proveriti sa pravnikom)

- **Označavanje:** Zakon o oglašavanju (Sl. glasnik 6/2016, 52/2019) važi i za internet i aplikacije kad je poruka usmerena na Srbiju; komercijalna priroda sadržaja mora biti jasno označena. Konkretan član nije potvrđen.
- **Zdravstvene tvrdnje:** Pravilnik o dodacima ishrani zabranjuje pripisivanje prevencije, lečenja ili tretiranja bolesti. Posebno obratiti pažnju na „nootropic" pozicioniranje ZenFlow-a. Izmene iz 2024 (73/24) nisu proverene.
- **Nadzor postoji** (prijavljeno preko 6.700 oglasa za neregistrovane suplemente).
- **Pravilo za app:** svaki affiliate link nosi oznaku „affiliate link" / „sponzorisano"; tvoj proizvod nosi oznaku „NuroLab". Bez zdravstvenih tvrdnji u preporukama.
- **Privatnost:** stack podaci su zdravstveno osetljivi. Treba politika privatnosti i, ako se prikupljaju zbirni podaci, jasno obaveštenje.

## 9. Implikacije za dizajn

1. **Proizvod-u-katalogu:** svaki suplement ima listu ponuda (prodavac, URL, prioritet, oznaka „moj proizvod"). Tvoj proizvod uvek prvi, affiliate iza. Novi proizvod = novi red u bazi.
2. **Preporuke po nameni (kategoriji):** stack se mapira na kategorije (fokus, san, stres, imunitet...), a svaki tvoj proizvod se vezuje za jednu ili više. Gumene bombone mogu da popune „rupu" gde ZenFlow ne odgovara.
3. **Affiliate samo kad nemaš svoj proizvod:** korisnik sa magnezijumom ili omega-3 dobija „Dopuni" ka partneru; tvoja preporuka se pojavljuje samo kad stack ima rupu koju tvoj proizvod stvarno pokriva.
4. **Jezgro funkcija:** stack sa dobom dana, push podsetnici, zalihe + trošak stack-a, „Dopuni" sa listom ponuda, javna početna stranica.
5. **Kasnije faze:** SEO stranice po suplementu (katalog od 100 stavki), eventualno skener, engleski jezik.
6. **Praćenje klikova:** sopstveni redirect sa logom (izvor, suplement, ponuda) da se meri koji kanal vraća kupca, nezavisno od affiliate mreže.

## 10. Otvorena pitanja

- Reddit niti (r/Supplements) ručno pročitati 20 minuta; tu su najiskrenije žalbe.
- Da li je iHerb prirodan „Dopuni" cilj, ili je dovoljan samo za dopunske suplemente (svoj proizvod ide na nurolab.rs)?
- Ime i domen novog aplikacije, odvojenog od NuroLab brenda ili uz njega?
- Politika privatnosti i pravni pregled oglašavanja suplemenata.
- Opseg MVP-a (sledeća sekcija dizajna).

## Izvori

- [Supplements AI: best supplement tracker apps](https://supplements-ai.com/blog/guides/best-supplement-tracker-apps)
- [StackIQ: poređenje 2026](https://getstackiq.com/guides/the-best-supplement-tracker-apps-in-2026-compared)
- [Dosefi: roundup](https://dosefi.app/best/supplement-tracker-apps)
- [VaultStack na AppGoblin](https://www.appgoblin.info/apps/com.mojosoft.vaultstack)
- [SuppCo (App Store)](https://apps.apple.com/us/app/suppco/id6504838951)
- [SuppTrack (App Store)](https://apps.apple.com/app/id6502848329)
- [Supplements AI (App Store)](https://apps.apple.com/app/id6741800649)
- [Supplemate (App Store)](https://apps.apple.com/ec/app/supplemate/id6740084610)
- [Supplify (App Store)](https://apps.apple.com/us/app/-/id6532579297)
- [SupStack (mwm.ai)](https://mwm.ai/apps/supstack-smart-stack-advisor/6757682290)
- [Supplement Tracker: Vitamin (App Store)](https://apps.apple.com/app/id6753359797)
- [SuppCo recenzije (justuseapp)](https://justuseapp.com/en/app/6504838951/suppco-supplement-scanner/reviews)
- [iHerb ROW na Awin-u](https://ui.awin.com/merchant-profile/76736)
- [iHerb dostava u Srbiju](https://ie.iherb.com/shipping/rs)
- [iHerb affiliate rezime (UpPromote)](https://uppromote.com/affiliate-directory/iherb/)
- [Myprotein na Awin-u](https://ui.awin.com/merchant-profile/19155)
- [GymBeam na affi.io](https://affi.io/m/gymbeam)
- [Thorne affiliate uslovi](https://www.thorne.com/terms/affiliate-program)
- [Affiliate programi u niši suplemenata (UpPromote)](https://uppromote.com/blog/supplement-affiliate-programs/)
- [SHARE vodič za oglašavanje na internetu](https://sharefoundation.info/wp-content/uploads/2024/10/Vodic-za-unapredenje-praksi-oglasavanja-na-internetu-Interactive-1.pdf)
- [Pravilnik o dodacima ishrani](https://zdravlje.gov.rs/extfile/sr/417714/Pravilnik%20o%20dodacima%20ishrani%20(dijetetski%20suplementi).pdf)
- [021.rs: neregistrovani oglasi za suplemente](https://www.021.rs/story/Info/Srbija/336775/Vise-od-6700-oglasa-o-suplementima-koji-nisu-registrovani-u-Srbiji.html)
