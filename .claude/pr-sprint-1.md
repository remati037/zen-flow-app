## Šta
Prvi sprint posle kompletne analize aplikacije (funkcionalnost, sigurnost, UI/UX, kod).

- **Ranjivosti:** Next 16.3.2 → 16.4.2, Clerk 7.9, Serwist 9.5.13. Zatvara critical/high advisory-je (RCE/SSRF u image optimizeru, cache poisoning). `npm audit --omit=dev` = 0.
- **Service worker:** kešira samo javne statičke fajlove. HTML/RSC, `/api/*` i cross-origin (Clerk FAPI) idu `NetworkOnly`; privatni keševi stare verzije se brišu na `activate`.
- **Gejt čitanja po stranici:** `requireAppAccess()` (React `cache()`) u svakoj `(app)` stranici — layout se pri RSC navigaciji ne izvršava uvek.
- **Refill link:** low-stock mejl vodi pravo u shop (ranije `/dashboard`); svi CTA-ovi kroz `lib/refill.ts` sa UTM tagovima.
- **Check-in posle ponoći:** `DayRolloverRefresh` + provera `belgradeToday()` pre slanja — tap na zastareloj kartici više ne upisuje jučerašnju dozu.
- **Clerk na srpskoj latinici** i uputstvo na `/sign-up` da se registruje mejlom sa kupovine.
- **QA:** `qa-routes`/`qa-sql` koriste `fileURLToPath` (pucale na razmaku u putanji).
- **CLAUDE.md:** nove konvencije.

## Testiranje
- `npm run qa` — 218 / 50 / 23 (DB deo `qa-sql` vozi CI)
- `npm run build` (webpack) — prolazi, `public/sw.js` generisan
- Sign-in i sign-up provereni u browseru
- ⚠️ Tokovi posle prijave nisu ručno testirani (nema lokalne baze). Preporuka: test prijave i check-in-a na Vercel preview-u (Clerk 7.5 → 7.9).

## Posle merge-a
- Kad webshop proradi: postaviti `NEXT_PUBLIC_SHOP_REFILL_URL` na Vercelu.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
