## Šta
Sprint 5: loading/error ekrani i pristupačnost. **Stoji na Sprintu 4** — spajati redom #2 → #3 → #4 → #5 → ovaj.

### Stanja ekrana
- `loading.tsx` za app i admin (skeleton) — tap u navigaciji više ne deluje „mrtvo" dok server odgovara.
- `error.tsx` (app, admin, koren), `not-found.tsx`, `global-error.tsx` — srpski tekst, „Pokušaj ponovo", put nazad i kod greške (`digest`) za podršku. Bez ovoga je Next prikazivao svoj engleski ekran.
- Check-in bez mreže: server akcija baca izuzetak koji niko nije hvatao, pa je dugme ostajalo „Uzeto" iako ništa nije upisano. Sada se stanje vraća uz poruku „Nema internet veze".

### Pristupačnost
- **Fokus:** `--ring` = ink + globalni `:focus-visible` outline. Ranije lime-deep na 50% (~1.2:1) — nevidljiv za korisnike tastature.
- **Dodir:** dugmad `h-10`/`h-11`, polja `h-11` na mobilnom; linkovi i ikonice na dashboardu, u zadacima, toast-u i onboardingu ≥ 44px.
- **Tekst ≥ 12px** (14 mesta je bilo 10–11px).
- `aria-label` za unos zadatka, `sr-only` sažetak grafikona doslednosti, Pomodoro najavljuje promenu faze, dialog „Zatvori".
- `prefers-reduced-motion` globalno + `MotionConfig` u onboardingu.

### Mobilni i PWA
- `safe-area-inset-top` u headeru (iPhone notch u instaliranom PWA).
- `colorScheme: 'light'` (Android auto-dark), theme boja paper, `start_url: /dashboard`, `lang="sr-Latn"`.
- Header bez Clerk `UserButton`-a (dupliran sa Podešavanja › Nalog).
- Amber → token `caution`.

## Testiranje
- `npm run qa` — 266 / 52 / 23 (bez lokalne baze; ovaj PR ne menja SQL — CI vozi pun `qa-sql`).
- `npm run build` — prolazi.
- U browseru (mobilni 375px): početna, fokus prsten tastaturom vidljiv.
- ⚠️ Ekrani iza prijave (dashboard sa novim dugmadima, error/loading u app-u) — pogledati na Vercel preview-u.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
