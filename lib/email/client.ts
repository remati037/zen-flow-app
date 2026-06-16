import 'server-only'

import { Resend } from 'resend'

let _resend: Resend | null = null

/**
 * Lazy Resend singleton — instancira se tek pri prvom slanju.
 * Tako import modula (npr. tokom `next build`) ne puca ako ključ još nije postavljen;
 * greška se javlja samo kad se mejl stvarno šalje.
 */
export function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY nije postavljen. Dodaj ga u .env.local')
  }
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

/**
 * FROM adresa za sve mejlove. Dok nurolab.rs nije verifikovan u Resend-u
 * koristi se onboarding@resend.dev (vidi .env.example).
 */
export const EMAIL_FROM = process.env.EMAIL_FROM ?? 'NuroLab <onboarding@resend.dev>'

/** Bazni URL aplikacije — za linkove/CTA dugmad u mejlovima. */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
