import 'server-only'

import { sql } from 'drizzle-orm'

import { db, focusQuizResults, profiles, supply } from '@/lib/db'

export type FinalizeOnboardingInput = {
  userId: string
  startDate: string
  doseMorningTime: string
  doseEveningTime: string
  score: number
  quizAnswers: number[]
  capsulesRemaining: number
  estimatedRunoutDate: string
  today: string
}

/**
 * Upis završetka onboardinga — profil, početne zalihe i baseline kviz u JEDNOJ
 * izjavi (neon-http nema `db.transaction()`). Vraća `false` ako je onboarding već
 * bio završen (nijedan red nije upisan).
 *
 *  - `where onboarding_completed = false` je pravi guard. Provera u akciji čita
 *    snapshot sa početka zahteva, pa dva paralelna submit-a oba prolaze kroz nju;
 *    ovde Postgres zaključava red i drugi zahtev dobije 0 redova u `claimed`.
 *  - Zalihe i kviz se upisuju SAMO iz `claimed`. Ranije je flag išao prvi, a
 *    zalihe posle — pad između ostavljao je korisnika u app-u bez `supply` reda,
 *    pa je svaki kasniji Woo top-up preskakan sa `no_supply_row`.
 *
 * Izdvojeno iz server akcije da ga `scripts/qa-sql.mts` izvršava nad pravim
 * Postgres-om (akcija traži Clerk sesiju, koje u harness-u nema).
 */
export async function finalizeOnboarding(input: FinalizeOnboardingInput): Promise<boolean> {
  const result = await db.execute<{ claimed: number }>(sql`
    with claimed as (
      update ${profiles}
      set "protocol_start_date" = ${input.startDate}::date,
          "dose_morning_time" = ${input.doseMorningTime}::time,
          "dose_evening_time" = ${input.doseEveningTime}::time,
          "focus_score_baseline" = ${input.score}::int,
          "onboarding_completed" = true
      where ${profiles.id} = ${input.userId} and ${profiles.onboardingCompleted} = false
      returning ${profiles.id} as id
    ),
    initial_supply as (
      insert into ${supply} ("user_id", "capsules_remaining", "estimated_runout_date", "low_stock_alerts_sent", "updated_at")
      select id, ${input.capsulesRemaining}::int, ${input.estimatedRunoutDate}::date, 0, now() from claimed
      on conflict ("user_id") do update
        set "capsules_remaining" = excluded."capsules_remaining",
            "estimated_runout_date" = excluded."estimated_runout_date",
            "low_stock_alerts_sent" = 0,
            "updated_at" = now()
      returning 1
    ),
    quiz as (
      insert into ${focusQuizResults} ("user_id", "date", "score", "answers")
      select id, ${input.today}::date, ${input.score}::int, ${JSON.stringify(input.quizAnswers)}::jsonb from claimed
      returning 1
    )
    select (select count(*) from claimed)::int as claimed
  `)

  return Number(result.rows[0]?.claimed ?? 0) > 0
}
