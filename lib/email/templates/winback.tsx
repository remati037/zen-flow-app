import { Button, Heading, Link, Section, Text } from '@react-email/components'

import type { WinbackStage } from '../../access/winback-rules'
import { brand, brandButtonStyle, EmailLayout } from './layout'

type WinbackEmailProps = {
  name?: string | null
  stage: WinbackStage
  /** Niz koji je bio aktivan kad je pristup istekao — pauziran, ne izgubljen. */
  pausedStreak: number
  /** Link za ponovnu kupovinu (shop sa UTM-om, ili fallback). */
  ctaHref: string
  unsubscribeUrl?: string | null
}

const COPY: Record<WinbackStage, { preview: string; heading: string; body: string }> = {
  1: {
    preview: 'Tvoj ZenFlow pristup je istekao. Niz je sačuvan i čeka te.',
    heading: 'Tvoj niz je pauziran',
    body:
      'Pristup aplikaciji je istekao jer je od poslednje porudžbine prošlo više od 60 dana. ' +
      'Istorija i niz su sačuvani tačno tamo gde su stali. Nastavljaju se ' +
      'čim stigne nova porudžbina.',
  },
  2: {
    preview: 'Efekat ZenFlow-a raste sa svakim danom protokola.',
    heading: 'Efekat se gradi iz dana u dan',
    body:
      'ZenFlow deluje postepeno. Fokus i mirnoća rastu uz svakodnevno uzimanje i slabe ' +
      'kad protokol stane. Što je pauza kraća, lakše se vraćaš u ritam.',
  },
  3: {
    preview: 'Poslednji podsetnik. Tvoj ZenFlow protokol čeka nastavak.',
    heading: 'Protokol te čeka',
    body:
      'Ovo je poslednji podsetnik od nas. Ako želiš da nastaviš, dovoljna je jedna porudžbina. ' +
      'Pristup se vraća sam, a niz se nastavlja odakle je stao.',
  },
}

/** Win-back mejl — šalje ga noćni `refresh-access` cron u 3 faze posle isteka pristupa. */
export function WinbackEmail({ name, stage, pausedStreak, ctaHref, unsubscribeUrl }: WinbackEmailProps) {
  const greeting = name ? `Zdravo ${name},` : 'Zdravo,'
  const copy = COPY[stage]

  return (
    <EmailLayout preview={copy.preview}>
      <Heading style={{ color: brand.ink, fontSize: 24, fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
        {copy.heading}
      </Heading>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
        {greeting}
      </Text>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
        {copy.body}
      </Text>

      {pausedStreak > 0 && (
        <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 24px' }}>
          Sačuvan niz: <strong>{pausedStreak} {pausedStreak % 10 === 1 && pausedStreak % 100 !== 11 ? 'dan' : 'dana'}</strong>.
          Nastavlja se čim obnoviš pristup.
        </Text>
      )}

      <Section style={{ textAlign: 'center', margin: '8px 0 8px' }}>
        <Button href={ctaHref} style={brandButtonStyle()}>
          Nastavi protokol
        </Button>
      </Section>

      {unsubscribeUrl && (
        <Text style={{ color: brand.muted, fontSize: 12, lineHeight: '18px', margin: '24px 0 0', textAlign: 'center' }}>
          Ne želiš ovakve poruke na mejl?{' '}
          <Link href={unsubscribeUrl} style={{ color: brand.muted, textDecoration: 'underline' }}>
            Isključi alert mejlove
          </Link>
          .
        </Text>
      )}
    </EmailLayout>
  )
}

export default WinbackEmail
