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
   * Emoji skala za odgovore 1–5 (indeks 0 = odgovor 1). Vizuelna zamena za
   * gola 1–5 dugmad; semantika i scoring su nepromenjeni.
   */
  emojis: readonly [string, string, string, string, string]
  /**
   * Bullet za "Tvoj 30-dnevni plan" kad je ovo pitanje među najslabijim
   * odgovorima. Vidi `buildPlanHighlights`.
   */
  weakPlan: { title: string; body: string }
}

export const FOCUS_QUIZ_QUESTIONS: readonly FocusQuizQuestion[] = [
  {
    key: 'focus',
    prompt: 'Koliko si u proseku fokusiran tokom radnog dana?',
    hint: 'Misli na tipičan radni dan poslednjih nedelju dana.',
    emojis: ['🌪️', '😵‍💫', '😐', '🎯', '🧠'],
    weakPlan: {
      title: 'Blokovi umesto celog dana',
      body: 'Kreni sa dva Pomodoro bloka dnevno u Fokusu — pažnja se lakše drži u intervalima nego kroz ceo dan.',
    },
  },
  {
    key: 'energy',
    prompt: 'Kakav ti je nivo energije tokom dana?',
    hint: 'Uključi i onaj popodnevni pad, ako ga imaš.',
    emojis: ['🪫', '🥱', '😌', '⚡', '🚀'],
    weakPlan: {
      title: 'Ujednači jutarnju dozu',
      body: 'Drži jutarnju dozu u istom terminu (±30 min). Ravnomeran ritam je ono što najviše ravna krivu energije.',
    },
  },
  {
    key: 'clarity',
    prompt: 'Koliko ti je um bistar i jasan?',
    hint: 'Koliko lako hvataš misao i donosiš odluke.',
    emojis: ['🌫️', '🌧️', '🌥️', '🌤️', '☀️'],
    weakPlan: {
      title: 'Bistrina se gradi nedeljama',
      body: 'Prvi jasan pomak se najčešće oseti oko 10.–14. dana. Zato pratimo niz, a ne pojedinačan dan.',
    },
  },
  {
    key: 'endurance',
    prompt: 'Koliko dugo zadržiš koncentraciju bez pada?',
    hint: 'Koliko traje jedan blok pre nego što ti pažnja odluta.',
    emojis: ['💨', '⏳', '⏱️', '🏃', '🏔️'],
    weakPlan: {
      title: 'Produžavaj postepeno',
      body: 'Prvih 7 dana radi 25-minutne blokove, pa tek onda idi na duže. Izdržljivost prati doslednost.',
    },
  },
  {
    key: 'morning',
    prompt: 'Koliko se budno i sveže osećaš ujutru?',
    hint: 'Prvih sat vremena posle buđenja.',
    emojis: ['😴', '🥱', '🙂', '🌅', '🐦'],
    weakPlan: {
      title: 'Jutro počinje večernjom dozom',
      body: 'Podesi večernju dozu bar dva sata pre spavanja i uključi podsetnik — jutarnja svežina zavisi od nje.',
    },
  },
] as const

/** Broj pitanja — koristi se za validaciju dužine niza odgovora. */
export const FOCUS_QUIZ_LENGTH = FOCUS_QUIZ_QUESTIONS.length

/** Skala odgovora za jedno pitanje. */
export const FOCUS_QUIZ_MIN = 1
export const FOCUS_QUIZ_MAX = 5

/** Labele skale (1–5) za UI — koriste se i kao pristupačan naziv emoji dugmeta. */
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
    summary: 'Startna tačka je niska — što znači da će razlika biti najuočljivija upravo kod tebe.',
  },
  {
    maxScore: 64,
    label: 'Solidna osnova',
    summary: 'Dobra polazna tačka. Doslednost je jedina varijabla koja te deli od sledećeg nivoa.',
  },
  {
    maxScore: 84,
    label: 'Jaka osnova',
    summary: 'Već funkcionišeš dobro. Protokol ti čuva vrh forme i ravna loše dane.',
  },
  {
    maxScore: 100,
    label: 'Vrhunska osnova',
    summary: 'Startuješ visoko. Cilj je da ovo postane tvoj prosek, a ne najbolji dan u nedelji.',
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
    title: 'Zaključaj ritam prve nedelje',
    body: 'Sedam dana u istim terminima je cilj broj jedan — posle toga protokol ide skoro sam od sebe.',
  },
  {
    key: 'zalihe',
    title: 'Ne dozvoli prazan dan',
    body: 'Prati zalihe u aplikaciji i naruči dopunu na vreme — pauza briše ono što si do tada izgradio.',
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
