import { Button, Heading, Section, Text } from '@react-email/components'

import { APP_URL } from '../client'
import { brand, brandButtonStyle, EmailLayout } from './layout'

type LowStockEmailProps = {
  name?: string | null
  capsulesRemaining: number
  runoutDate?: string | null
}

function formatDate(value?: string | null) {
  if (!value) return null
  // value je `YYYY-MM-DD` (Drizzle `date`). Prikaži kao DD.MM.YYYY.
  const [y, m, d] = value.split('-')
  if (!y || !m || !d) return value
  return `${d}.${m}.${y}.`
}

/** Low-stock alert — šalje cron kad kapsule padnu ispod praga. */
export function LowStockEmail({ name, capsulesRemaining, runoutDate }: LowStockEmailProps) {
  const greeting = name ? `Zdravo ${name},` : 'Zdravo,'
  const runout = formatDate(runoutDate)

  return (
    <EmailLayout preview={`Ostalo ti je još ${capsulesRemaining} kapsula — vreme za refill.`}>
      <Heading style={{ color: brand.ink, fontSize: 24, fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
        Zalihe su ti pri kraju ⏳
      </Heading>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
        {greeting}
      </Text>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
        Ostalo ti je još <strong>{capsulesRemaining} kapsula</strong>
        {runout ? (
          <>
            {' '}— po trenutnom ritmu, zaliha ti se završava oko <strong>{runout}</strong>
          </>
        ) : null}
        .
      </Text>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 24px' }}>
        Setimo se kako ZenFlow radi: <strong>pauza u protokolu poništava napredak koji si do sada
        izgradio.</strong> Naruči refill na vreme da ne prekineš streak i ne izgubiš efekte.
      </Text>

      <Section style={{ textAlign: 'center', margin: '8px 0 8px' }}>
        <Button href={`${APP_URL}/dashboard`} style={brandButtonStyle()}>
          Naruči refill
        </Button>
      </Section>
    </EmailLayout>
  )
}

export default LowStockEmail
