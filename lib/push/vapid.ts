import 'server-only'

import crypto from 'node:crypto'

/**
 * Provera VAPID konfiguracije.
 *
 * Zašto postoji: ako `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (kojim browser pravi
 * pretplatu, ubačen u bundle na build-u) ne odgovara `VAPID_PRIVATE_KEY`-u na
 * serveru, push servis vraća **403** na svako slanje. Pretplata postoji, kod ne
 * puca, ali notifikacija se nikad ne isporuči — najtiši mogući otkaz.
 *
 * Par se može proveriti matematički: VAPID ključevi su P-256 (prime256v1), pa
 * se javni ključ IZVODI iz privatnog. Ako izvedeni ne odgovara onom iz env-a,
 * par je pomešan (npr. regenerisan samo jedan, ili je samo jedan ažuriran na
 * Vercelu pa build nosi stari public).
 */

export type VapidStatus = {
  publicKeySet: boolean
  privateKeySet: boolean
  subject: string
  /** Prvih 12 karaktera javnog ključa — dovoljno za poređenje sa Vercel env-om, bez otkrivanja tajni. */
  publicKeyPrefix: string | null
  /** `true` = par se poklapa, `false` = ne poklapa (403 na svako slanje), `null` = ne može da se proveri. */
  pairMatches: boolean | null
  /** Čitljiv opis problema, ili `null` kad je sve u redu. */
  problem: string | null
}

export function checkVapidConfig(): VapidStatus {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:podrska@nurolab.rs'

  const base: VapidStatus = {
    publicKeySet: Boolean(publicKey),
    privateKeySet: Boolean(privateKey),
    subject,
    publicKeyPrefix: publicKey ? publicKey.slice(0, 12) : null,
    pairMatches: null,
    problem: null,
  }

  if (!publicKey || !privateKey) {
    return {
      ...base,
      problem: `Nedostaje ${!publicKey ? 'NEXT_PUBLIC_VAPID_PUBLIC_KEY' : 'VAPID_PRIVATE_KEY'}. Generiši par sa "npx web-push generate-vapid-keys" i postavi obe na Vercel.`,
    }
  }

  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    return {
      ...base,
      problem: `VAPID_SUBJECT mora počinjati sa "mailto:" ili "https://" (trenutno: ${subject}).`,
    }
  }

  try {
    const decode = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    const pubBuf = decode(publicKey)
    const privBuf = decode(privateKey)

    if (pubBuf.length !== 65 || pubBuf[0] !== 0x04) {
      return { ...base, problem: `Javni VAPID ključ nije validan P-256 ključ (${pubBuf.length} bajtova, očekivano 65 sa prefiksom 0x04).` }
    }
    if (privBuf.length !== 32) {
      return { ...base, problem: `Privatni VAPID ključ nije validan (${privBuf.length} bajtova, očekivano 32).` }
    }

    const ecdh = crypto.createECDH('prime256v1')
    ecdh.setPrivateKey(privBuf)
    const derived = ecdh.getPublicKey()

    if (!derived.equals(pubBuf)) {
      return {
        ...base,
        pairMatches: false,
        problem:
          'VAPID par se NE poklapa — javni ključ nije izveden iz ovog privatnog. ' +
          'Push servis vraća 403 na svako slanje i notifikacije se nikad ne isporuče. ' +
          'Postavi OBA ključa iz istog para na Vercel i uradi REDEPLOY (javni ključ se ugrađuje u bundle na build-u).',
      }
    }

    return { ...base, pairMatches: true }
  } catch (err) {
    return {
      ...base,
      problem: `VAPID ključevi se ne mogu dekodirati: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
