import { z } from 'zod'

/** Vreme u 'HH:MM' formatu (24h), kompatibilno sa Postgres `time` kolonom. */
export const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Vreme mora biti u formatu HH:MM.')
