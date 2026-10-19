import { Button, Heading, Link, Section, Text } from '@react-email/components'

import { APP_URL } from '../client'
import { refillUrl } from '../../refill'
import { brand, brandButtonStyle, EmailLayout } from './layout'

type LowStockEmailProps = {
  name?: string | null
  capsulesRemaining: number
  runoutDate?: string | null
  /**
   * Potpisani odjavni link (`lib/email/unsubscribe.ts`), ili `null` kad tajna za
   * potpis nije postavljena. Vidljiv link postoji UZ `List-Unsubscribe` zaglavlje,
   * ne umesto njega: zaglavlje prikazuju samo neki klijenti, a alert mejl bez
   * ijedne vidljive odjave se ne odjavljuje — prijavljuje se kao spam.
   */
  unsubscribeUrl?: string | null
  /**
   * Alert je okinut po procenjenom datumu isteka, ne po broju kapsula: korisnik ne
   * štiklira doze, pa `capsulesRemaining` u bazi nije tačan i ne prikazuje se.
   */
  estimated?: boolean
}

function formatDate(value?: string | null) {
  if (!value) return null
  // value je `YYYY-MM-DD` (Drizzle `date`). Prikaži kao DD.MM.YYYY.
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}.${m}.${y}.`
}

/** Low-stock alert — šalje cron kad kapsule padnu ispod praga. */
export function LowStockEmail({
  name,
  capsulesRemaining,
  runoutDate,
  unsubscribeUrl,
  estimated = false,
}: LowStockEmailProps) {
  const greeting = name ? `Zdravo ${name},` : 'Zdravo,'
  const runout = formatDate(runoutDate)
  // Pravo u shop (sa UTM-om) — svaki dodatni korak između mejla i korpe gubi
  // kupovinu. Dok shop link nije postavljen, vodi na zalihe u app-u.
  const ctaHref = refillUrl('email_low_stock') ?? `${APP_URL}/zalihe`

  return (
    <EmailLayout
      preview={
        estimated
          ? 'Po našoj proceni zalihe su ti pri kraju — vreme za refill.'
          : `Ostalo ti je još ${capsulesRemaining} kapsula — vreme za refill.`
      }
    >
      <Heading style={{ color: brand.ink, fontSize: 24, fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
        Zalihe su ti pri kraju ⏳
      </Heading>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
        {greeting}
      </Text>

      {estimated ? (
        <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
          Po našoj proceni zalihe su ti pri kraju
          {runout ? (
            <>
              {' '}— ističu oko <strong>{runout}</strong>
            </>
          ) : null}
          . Ako doze uzimaš, a ne štikliraš ih u aplikaciji, zalihe na ekranu
          pokazuju više nego što stvarno imaš.
        </Text>
      ) : (
        <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
          Ostalo ti je još <strong>{capsulesRemaining} kapsula</strong>
          {runout ? (
            <>
              {' '}— po trenutnom ritmu, zaliha ti se završava oko <strong>{runout}</strong>
            </>
          ) : null}
          .
        </Text>
      )}

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 24px' }}>
        Setimo se kako ZenFlow radi: <strong>pauza u protokolu poništava napredak koji je do sada
        izgrađen.</strong> Naruči refill na vreme da ne prekineš niz i ne izgubiš efekte.
      </Text>

      <Section style={{ textAlign: 'center', margin: '8px 0 8px' }}>
        <Button href={ctaHref} style={brandButtonStyle()}>
          Naruči refill
        </Button>
      </Section>

      {unsubscribeUrl && (
        <Text style={{ color: brand.muted, fontSize: 12, lineHeight: '18px', margin: '24px 0 0', textAlign: 'center' }}>
          Ne želiš ovakve podsetnike na mejl?{' '}
          <Link href={unsubscribeUrl} style={{ color: brand.muted, textDecoration: 'underline' }}>
            Isključi alert mejlove
          </Link>
          . Push podsetnici i sam nalog ostaju netaknuti.
        </Text>
      )}
    </EmailLayout>
  )
}

export default LowStockEmail
