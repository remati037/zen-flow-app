import type { TimeOfDay } from './time-of-day'

/** Jedan aktivan unos u korisnikovom stack-u (deli ga server i klijent). */
export interface StackRow {
  id: number
  catalogKey: string | null
  customName: string | null
  timeOfDay: TimeOfDay
  doseNote: string | null
}
