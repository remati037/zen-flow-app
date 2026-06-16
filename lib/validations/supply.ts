import { z } from 'zod'

/**
 * Ručno ažuriranje preostalih kapsula.
 */
export const updateSupplySchema = z.object({
  capsulesRemaining: z.coerce.number().int().min(0).max(1000),
})

export type UpdateSupplyInput = z.infer<typeof updateSupplySchema>
