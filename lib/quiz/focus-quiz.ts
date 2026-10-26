/**
 * Focus Score baseline kviz (Korak 1.4 — onboarding, obogaćen u 1.13).
 *
 * 5 pitanja, svako na skali 1–5 (1 = veoma loše, 5 = odlično).
 * Ukupan zbir (5–25) se normalizuje na skor 0–100 i upisuje u
 * `profiles.focusScoreBaseline` + `focus_quiz_results`.
 *
 * Bez `server-only` — modul dele klijent (wizard) i server (akcija).
 */

export interface FocusQuizQuestion {
  /** Stabilan ključ (za eventualni re-kviz / trend u Fazi 2). */
  key: string
  /** Tekst pitanja (srpski, latinica). */
  prompt: string
  /** Kratak podnaslov ispod pitanja — kontekst da korisnik zna šta ocenjuje. */
  hint: string
  /**
   * Bullet za "Tvoj 30-dnevni plan" kad je ovo pitanje među najslabijim
   * odgovorima. Vidi `buildPlanHighlights`.
   */
  weakPlan: { title: string; body: string }
}

export const FOCUS_QUIZ_QUESTIONS: readonly FocusQuizQuestion[] = [
  {
    key: 'focus',
    prompt: 'Kako ti ide fokus tokom radnog dana?',
    hint: 'Misli na tipičan radni dan u poslednjih nedelju dana.',
    weakPlan: {
      title: 'Radi u kraćim blokovima',
      body: 'Umesto da pokušavaš da zadržiš fokus ceo dan, podeli posao na blokove od 25 minuta sa kratkom pauzom. Kreni sa dva bloka dnevno u delu Fokus.',
    },
  },
  {
    key: 'energy',
    prompt: 'Kakva ti je energija tokom dana?',
    hint: 'Uračunaj i popodnevni pad, ako ga imaš.',
    weakPlan: {
      title: 'Jutarnja doza uvek u isto vreme',
      body: 'Uzimaj jutarnju dozu svakog dana u isto vreme, uz odstupanje od najviše pola sata. Ujednačen ritam najviše doprinosi stabilnoj energiji.',
    },
  },
  {
    key: 'clarity',
    prompt: 'Kako ocenjuješ bistrinu misli?',
    hint: 'Koliko lako pratiš misao, pamtiš detalje i donosiš odluke.',
    weakPlan: {
      title: 'Daj protokolu dve nedelje',
      body: 'Bistrina se ne gradi preko noći. Većina ljudi prvu jasnu razliku primeti između 10. i 14. dana, zato je važno da ne preskačeš dane.',
    },
  },
  {
    key: 'endurance',
    prompt: 'Kako ti ide duža koncentracija na jednom zadatku?',
    hint: 'Na primer, sat vremena čitanja ili rada bez odlutalih misli i proveravanja telefona.',
    weakPlan: {
      title: 'Produžavaj blokove postepeno',
      body: 'Prve nedelje radi u blokovima od 25 minuta. Kad ti to postane lako, pređi na blokove od 50 minuta. Koncentracija se, kao i kondicija, gradi postepeno.',
    },
  },
  {
    key: 'morning',
    prompt: 'Kakva su ti jutra, koliko se budno i sveže osećaš?',
    hint: 'Misli na prvih sat vremena posle buđenja.',
    weakPlan: {
      title: 'Stalan ritam za lakša jutra',
      body: 'Uzimaj obe doze svakog dana u isto vreme, popodnevnu oko 14h. Uključi podsetnike da nijednu ne propustiš.',
    },
  },
] as const

/** Broj pitanja — koristi se za validaciju dužine niza odgovora. */
export const FOCUS_QUIZ_LENGTH = FOCUS_QUIZ_QUESTIONS.length

/** Skala odgovora za jedno pitanje. */
export const FOCUS_QUIZ_MIN = 1
export const FOCUS_QUIZ_MAX = 5

/** Labele skale (1–5) za UI — prikazuju se ispod broja i u pristupačnom nazivu dugmeta. */
export const FOCUS_QUIZ_SCALE_LABELS = ['Veoma loše', 'Loše', 'Osrednje', 'Dobro', 'Odlično'] as const

/**
 * Normalizuje zbir odgovora (min..max po pitanju) na skor 0–100.
 * Za 5 pitanja × 1–5: zbir 5 → 0, zbir 25 → 100.
 */
export function scoreFocusQuiz(answers: number[]): number {
  const min = FOCUS_QUIZ_LENGTH * FOCUS_QUIZ_MIN
  const max = FOCUS_QUIZ_LENGTH * FOCUS_QUIZ_MAX
  const sum = answers.reduce((acc, value) => acc + value, 0)
  const clamped = Math.min(max, Math.max(min, sum))
  return Math.round(((clamped - min) / (max - min)) * 100)
}

/* ── Rezultat: bendovi skora ─────────────────────────────────────── */

export interface FocusScoreBand {
  /** Gornja granica benda (uključivo). */
  maxScore: number
  label: string
  /** Jedna rečenica ispod gauge-a — uvek pozitivno uokvireno. */
  summary: string
}

/** Redosled je bitan — `getFocusScoreBand` uzima prvi band čiji `maxScore` pokriva skor. */
export const FOCUS_SCORE_BANDS: readonly FocusScoreBand[] = [
  {
    maxScore: 39,
    label: 'Niska osnova',
    summary: 'Polazna tačka je niska, pa ćeš razliku verovatno osetiti najjasnije.',
  },
  {
    maxScore: 64,
    label: 'Solidna osnova',
    summary: 'Dobra polazna tačka. Uz redovan protokol sledeći nivo je blizu.',
  },
  {
    maxScore: 84,
    label: 'Jaka osnova',
    summary: 'Već ti ide dobro. Protokol pomaže da tako ostane i u lošijim danima.',
  },
  {
    maxScore: 100,
    label: 'Vrhunska osnova',
    summary: 'Krećeš visoko. Cilj je da ovakvi dani postanu tvoj prosek.',
  },
] as const

/** Band za dati skor 0–100. Nikad ne vraća `undefined` (poslednji band pokriva 100). */
export function getFocusScoreBand(score: number): FocusScoreBand {
  const clamped = Math.min(100, Math.max(0, score))
  return FOCUS_SCORE_BANDS.find((band) => clamped <= band.maxScore) ?? FOCUS_SCORE_BANDS[FOCUS_SCORE_BANDS.length - 1]
}

/* ── Rezultat: personalizovani 30-dnevni plan ────────────────────── */

export interface PlanHighlight {
  /** Ključ pitanja iz kog je bullet izveden. */
  key: string
  title: string
  body: string
}

/** Odgovor ovoliko ili niži se smatra "slabom tačkom" vrednom bulleta. */
const WEAK_ANSWER_THRESHOLD = 3
const PLAN_MIN_HIGHLIGHTS = 2
const PLAN_MAX_HIGHLIGHTS = 3

/**
 * Dopuna plana kad korisnik nema (dovoljno) slabih odgovora. Remedijalni tekst
 * uz ocenu 5 bi zvučao pogrešno, pa se umesto njega dopunjava generičkim
 * savetima o doslednosti — istom porukom na kojoj počiva ceo protokol.
 */
const PLAN_BASELINE_HIGHLIGHTS: readonly PlanHighlight[] = [
  {
    key: 'ritam',
    title: 'Prvi cilj: sedam dana zaredom',
    body: 'Nedelju dana bez propuštene doze, u istim terminima. Posle toga protokol postaje navika.',
  },
  {
    key: 'zalihe',
    title: 'Bez praznih dana',
    body: 'Aplikacija prati koliko ti je kapsula ostalo i javlja ti na vreme. Naruči dopunu pre nego što ostaneš bez zaliha, jer pauza vraća napredak unazad.',
  },
] as const

/**
 * 2–3 bulleta za "Tvoj 30-dnevni plan", izvedena iz najslabijih odgovora.
 *
 * Sortira pitanja po oceni rastuće (stabilno — kod izjednačenja pobeđuje
 * redosled iz kataloga) i uzima do tri sa ocenom ≤ 3. Ako slabih tačaka nema
 * dovoljno, plan se dopunjava generičkim savetima (vidi
 * `PLAN_BASELINE_HIGHLIGHTS`). Nepotpuni nizovi (`null` u toku kviza) se
 * tretiraju kao maksimum, tj. ne guraju se u plan.
 */
export function buildPlanHighlights(answers: readonly (number | null)[]): PlanHighlight[] {
  const weak = FOCUS_QUIZ_QUESTIONS.map((question, index) => ({
    question,
    index,
    value: answers[index] ?? FOCUS_QUIZ_MAX,
  }))
    .filter((entry) => entry.value <= WEAK_ANSWER_THRESHOLD)
    .sort((a, b) => a.value - b.value || a.index - b.index)
    .slice(0, PLAN_MAX_HIGHLIGHTS)

  const highlights: PlanHighlight[] = weak.map(({ question }) => ({
    key: question.key,
    title: question.weakPlan.title,
    body: question.weakPlan.body,
  }))

  for (const baseline of PLAN_BASELINE_HIGHLIGHTS) {
    if (highlights.length >= PLAN_MIN_HIGHLIGHTS) break
    highlights.push(baseline)
  }

  return highlights
}
