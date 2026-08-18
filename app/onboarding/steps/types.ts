/**
 * Zajednički tipovi onboarding wizarda (Korak 1.13).
 *
 * State živi isključivo na klijentu (`onboarding-wizard.tsx`) i persistuje se
 * tek na kraju, kroz jedan poziv `completeOnboarding` — bez parcijalnog upisa.
 */

/** Skica koju korisnik popunjava kroz korake; `packages` je string zbog `<input>`. */
export interface OnboardingDraft {
  packages: string
  startDate: string
  doseMorningTime: string
  doseEveningTime: string
  quizAnswers: (number | null)[]
}

/** Izračun zaliha iz broja pakovanja + datuma početka (računa se u wizardu). */
export interface SupplyEstimate {
  packages: number
  capsules: number
  days: number
  /** Formatiran datum isteka na srpskom, ili prazan string ako je datum nevalidan. */
  runoutLabel: string
}
