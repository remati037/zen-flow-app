/**
 * Zdravlje zakazanih poslova — čiste funkcije, bez DB i bez `server-only`.
 *
 * Dele ih tri strane: cron rute (koje upisuju heartbeat), admin dijagnostika
 * (koja objašnjava zašto podsetnik nije stigao) i `scripts/qa-dates.mts`.
 * Bez ovog modula bi se pravilo "šta je rupa" duplirala i razišla, tačno kao
 * što se dešavalo sa aritmetikom prozora pre `lib/push/dispatch-rules.ts`.
 */

/** Stabilni ključevi poslova u `cron_runs.job`. */
export const CRON_JOBS = {
  notifications: 'notifications',
  lowStock: 'low-stock',
  /** Dnevni izveštaj o isporučenosti (O-M1) — vidi `app/api/cron/daily-report/route.ts`. */
  dailyReport: 'daily-report',
} as const

export type CronJob = (typeof CRON_JOBS)[keyof typeof CRON_JOBS]

/**
 * Posle koliko sati bez ijednog poziva dispatcher smatramo mrtvim.
 *
 * Zašto 2h: scheduler ide na 15 min, a GitHub Actions pod opterećenjem ume da
 * kasni „najviše na pun sat" i da preskoči poneki run. Jedan-dva propuštena
 * run-a su normalna buka; osam uzastopnih nisu — to je oboren raspored,
 * pogrešan `CRON_SECRET` ili ugašen workflow. Prag mora biti iznad najgoreg
 * normalnog kašnjenja (≈1h), inače alert vrišti bez razloga i prestane da se
 * čita — a alert koji se ne čita je isto što i nikakav.
 */
export const DISPATCHER_STALE_HOURS = 2

const MS_PER_MIN = 60_000

/** Minuta između dva instanta, zaokruženo. Negativno se svodi na 0 (sat unazad). */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / MS_PER_MIN))
}

/**
 * Da li je razmak između dva run-a širi od prozora podsetnika.
 *
 * Ovo je JEDINA rupa koja stvarno boli: dok je razmak ≤ prozor, svaki prozor
 * dobije bar jedan tick i nijedan podsetnik ne propadne. Čim razmak pređe
 * prozor, postoje vremena doza koja nijedan run nije video — i ti podsetnici
 * su izgubljeni zauvek (dedup ih ne vraća, jer se prozor ne ponavlja).
 */
export function isGapMissed(gapMin: number | null, windowMin: number): boolean {
  return gapMin !== null && gapMin > windowMin
}

export type DispatcherRun = {
  lastRunAt: Date
  lastGapMin: number | null
  maxGapMin: number | null
  maxGapAt: Date | null
  runsTotal: number
}

export type DispatcherHealth = {
  /** `never` = nijedan run nikad; `stale` = mrtav duže od praga; `gaps` = živ ali je propuštao. */
  status: 'ok' | 'gaps' | 'stale' | 'never'
  /** Minuta od poslednjeg run-a, `null` kad run-a nema. */
  sinceLastRunMin: number | null
  lastRunAt: string | null
  lastGapMin: number | null
  maxGapMin: number | null
  maxGapAt: string | null
  runsTotal: number
  /** Rečenica za admina — šta je tačno u kvaru i šta da uradi. */
  message: string
}

/**
 * Prevede heartbeat red u dijagnozu. Čista funkcija (`now` se ubrizgava), da je
 * QA može voziti pod zamrznutim satom.
 */
export function describeDispatcherHealth({
  run,
  now,
  windowMin,
  staleHours = DISPATCHER_STALE_HOURS,
}: {
  run: DispatcherRun | null
  now: Date
  windowMin: number
  staleHours?: number
}): DispatcherHealth {
  if (!run) {
    return {
      status: 'never',
      sinceLastRunMin: null,
      lastRunAt: null,
      lastGapMin: null,
      maxGapMin: null,
      maxGapAt: null,
      runsTotal: 0,
      message:
        '/api/cron/notifications nije pozvan NIJEDNOM — scheduler nije podešen ili ne pogađa rutu. ' +
        'Vercel je NE pokreće; vozi je GitHub Actions workflow (docs/cron-setup.md).',
    }
  }

  const sinceLastRunMin = minutesBetween(run.lastRunAt, now)
  const base = {
    sinceLastRunMin,
    lastRunAt: run.lastRunAt.toISOString(),
    lastGapMin: run.lastGapMin,
    maxGapMin: run.maxGapMin,
    maxGapAt: run.maxGapAt ? run.maxGapAt.toISOString() : null,
    runsTotal: run.runsTotal,
  }

  if (sinceLastRunMin >= staleHours * 60) {
    return {
      ...base,
      status: 'stale',
      message:
        `Dispatcher nije pozvan ${formatMinutes(sinceLastRunMin)} (prag je ${staleHours}h). ` +
        'Podsetnici trenutno NE izlaze. Proveri GitHub Actions → „Notification dispatcher" ' +
        '(raspored ume da se ugasi posle 60 dana neaktivnosti repoa) i da se CRON_SECRET poklapa.',
    }
  }

  if (isGapMissed(run.maxGapMin, windowMin)) {
    return {
      ...base,
      status: 'gaps',
      message:
        `Dispatcher radi, ali je bar jednom ćutao ${formatMinutes(run.maxGapMin!)} — šire od prozora ` +
        `od ${windowMin} min, pa su podsetnici u toj rupi izgubljeni. Ako se ponavlja, prebaci ` +
        'scheduler na cron-job.org (docs/cron-setup.md, opcija B) ili proširi NOTIFICATION_WINDOW_MIN.',
    }
  }

  return {
    ...base,
    status: 'ok',
    message: `Dispatcher je živ — poslednji run pre ${formatMinutes(sinceLastRunMin)}, bez rupa širih od ${windowMin} min.`,
  }
}

/** '95' → '1h 35min'. Sati se pojave tek kad ih ima — admin čita, ne mašina. */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}
