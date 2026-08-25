import { createHmac, timingSafeEqual } from 'node:crypto'

import { APP_URL } from '@/lib/app-url'

/**
 * Potpisani odjavni linkovi za `List-Unsubscribe` (V10).
 *
 * Zašto potpis, a ne samo `?u=<userId>`: ruta MORA biti javna (mejl klijent i
 * mailbox provider je zovu bez Clerk sesije), pa bi go userId značio da bilo ko
 * može da odjavi bilo koga probanjem id-eva. HMAC vezuje id za tajnu koju zna
 * samo server; token ne otkriva ključ i ne može se izmisliti.
 *
 * Čist modul (bez `server-only`): potpis je obična kripto funkcija i mora da bude
 * pokriven QA harness-om — pokvaren token znači ili odjavu koja ne radi (→ prijava
 * spama) ili odjavu koju može da izvede bilo ko (→ gašenje tuđih alerta).
 *
 * Namerno BEZ isteka: odjava mora da radi i iz mejla starog godinu dana —
 * dugme koje ne radi je razlog zbog kog ljudi umesto njega kliknu „Spam", a
 * prijava spama košta reputaciju domena. Token je jednonamenski (samo gasi
 * alerte), pa nema šta da se zloupotrebi kroz starost.
 */

/**
 * Ključ za potpis. Zaseban `EMAIL_UNSUBSCRIBE_SECRET` ako postoji, inače
 * `CRON_SECRET` (već obavezan, server-only, nikad ne ide klijentu).
 *
 * Deljenje ključa je bezbedno jer se on nikad ne prenosi — u URL-u je samo HMAC
 * digest, iz kog se ključ ne izvodi. Alternativa (nova OBAVEZNA env varijabla)
 * bi značila da odjava tiho ne radi kod svakog ko je zaboravi da postavi, a to
 * je gori ishod od deljenja tajne između dve interne namene.
 */
function signingKey(): string | null {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || null
}

/** HMAC-SHA256 hex za dati Clerk user id, ili `null` kad tajna nije postavljena. */
export function unsubscribeToken(userId: string): string | null {
  const key = signingKey()
  if (!key) return null
  return createHmac('sha256', key).update(`unsubscribe:${userId}`).digest('hex')
}

/**
 * Provera tokena u konstantnom vremenu.
 *
 * `timingSafeEqual` baca na različitim dužinama, pa se dužina proverava unapred —
 * očekivani token je uvek 64 hex znaka, tako da to ništa ne curi.
 */
export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = unsubscribeToken(userId)
  if (!expected || token.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'))
}

/** Pun odjavni URL za mejl, ili `null` kad potpis nije moguć. */
export function unsubscribeUrl(userId: string): string | null {
  const token = unsubscribeToken(userId)
  if (!token) return null
  return `${APP_URL}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${token}`
}

/**
 * `List-Unsubscribe` + `List-Unsubscribe-Post` zaglavlja za jedan mejl.
 *
 * Oba idu zajedno i to je bitno: `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 * je obećanje da URL prihvata **POST** i odjavljuje bez ijednog dodatnog klika
 * (RFC 8058). Gmail/Yahoo to traže od masovnih pošiljalaca; ako se zaglavlje
 * deklariše a ruta ne odgovori na POST, provajder to broji kao pokvarenu odjavu.
 * Zato `app/api/email/unsubscribe/route.ts` ima i `POST` i `GET`.
 *
 * Vraća prazan objekat kad tajna nije postavljena — mejl tada ide bez zaglavlja
 * (link u podnožju i dalje radi), umesto da se slanje obori.
 */
export function unsubscribeHeaders(userId: string): Record<string, string> {
  const url = unsubscribeUrl(userId)
  if (!url) return {}
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}
