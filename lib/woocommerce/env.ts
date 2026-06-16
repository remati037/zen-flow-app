import 'server-only'

/**
 * Čitanje WooCommerce env varijabli sa jasnom greškom kad nedostaju.
 * Pozivaju se lazy (u handler-u), ne na import-u, da build ne pukne ako
 * varijabla nije postavljena u svim okruženjima.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} nije postavljen. Dodaj ga u .env.local / Vercel env.`)
  }
  return value
}

/** Secret koji se poklapa sa "Secret" poljem WooCommerce webhook-a. */
export function getWebhookSecret(): string {
  return required('WOO_WEBHOOK_SECRET')
}

/** REST API kredencijali + base URL shopa (za backfill). */
export function getRestCredentials(): {
  storeUrl: string
  consumerKey: string
  consumerSecret: string
} {
  return {
    storeUrl: required('WOO_STORE_URL').replace(/\/$/, ''),
    consumerKey: required('WOO_CONSUMER_KEY'),
    consumerSecret: required('WOO_CONSUMER_SECRET'),
  }
}
