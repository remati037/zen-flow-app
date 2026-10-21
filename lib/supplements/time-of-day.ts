export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening'] as const

export type TimeOfDay = (typeof TIMES_OF_DAY)[number]

export const TIME_LABELS: Record<TimeOfDay, string> = {
  morning: 'Jutro',
  afternoon: 'Popodne',
  evening: 'Veče',
}
