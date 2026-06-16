import { z } from 'zod'

/**
 * Tolerantna zod šema za WooCommerce order payload.
 * Validiramo samo polja koja koristimo; ostalo Woo šalje u izobilju i ignorišemo ga.
 */

const wooLineItemSchema = z
  .object({
    sku: z.string().nullish(),
    quantity: z.coerce.number().nullish(),
    product_id: z.coerce.number().nullish(),
  })
  .loose()

export const wooOrderSchema = z
  .object({
    id: z.coerce.number(),
    status: z.string(),
    // Woo šalje ISO datume; `date_paid`/`date_completed` mogu biti null dok porudžbina nije plaćena.
    date_created: z.string().nullish(),
    date_paid: z.string().nullish(),
    billing: z
      .object({
        email: z.email().nullish(),
      })
      .loose(),
    line_items: z.array(wooLineItemSchema).default([]),
  })
  .loose()

export type WooOrderPayload = z.infer<typeof wooOrderSchema>
