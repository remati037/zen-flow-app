import { z } from 'zod'

import { isCatalogKey } from '@/lib/supplements/catalog'
import { normalizeSearch } from '@/lib/supplements/search'
import { TIMES_OF_DAY } from '@/lib/supplements/time-of-day'

export const timeOfDaySchema = z.enum(TIMES_OF_DAY)

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

const customNameSchema = z
  .string()
  .transform(collapse)
  .pipe(
    z
      .string()
      .min(2, 'Naziv je prekratak.')
      .max(60, 'Naziv je predugačak (najviše 60 znakova).')
      // Samo interpunkcija („--") prođe dužinu, ali se normalizuje u prazan string.
      .refine((v) => normalizeSearch(v).length >= 2, 'Naziv je prekratak.'),
  )

const doseNoteSchema = z
  .string()
  .transform(collapse)
  .pipe(z.string().max(40, 'Najviše 40 znakova.'))

export const addSupplementSchema = z
  .object({
    catalogKey: z.string().refine(isCatalogKey, 'Nepoznat suplement.').optional(),
    customName: customNameSchema.optional(),
    timeOfDay: timeOfDaySchema,
    // Prazno polje = bez napomene.
    doseNote: doseNoteSchema.optional().transform((v) => (v === '' ? undefined : v)),
  })
  .refine((v) => (v.catalogKey !== undefined) !== (v.customName !== undefined), {
    message: 'Izaberi suplement ili upiši naziv.',
  })

export const updateSupplementSchema = z
  .object({
    id: z.number().int().positive(),
    timeOfDay: timeOfDaySchema.optional(),
    // `null` ili prazan string briše napomenu.
    doseNote: doseNoteSchema
      .nullable()
      .optional()
      .transform((v) => (v === '' ? null : v)),
    // Ponovno uključivanje ide kroz addSupplement (ima granicu); update sme samo da ukloni.
    active: z.literal(false).optional(),
  })
  .refine((v) => v.timeOfDay !== undefined || v.doseNote !== undefined || v.active !== undefined, {
    message: 'Nema promene.',
  })

export const confirmStackSchema = z.object({})
export const clearStackSchema = z.object({})

/** Admin: `name` je tačno `lower(custom_name)` iz liste (bez JS lowercase-a). */
export const mergeCustomSchema = z.object({
  name: z.string().min(1).max(60),
  intoKey: z.string().refine(isCatalogKey, 'Nepoznat suplement.').nullable(),
})
