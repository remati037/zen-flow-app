import { Button, Heading, Section, Text } from '@react-email/components'

import { APP_URL } from '../client'
import { brand, brandButtonStyle, EmailLayout } from './layout'

type WelcomeEmailProps = {
  name?: string | null
}

/** Welcome mejl — šalje se na Clerk `user.created`. */
export function WelcomeEmail({ name }: WelcomeEmailProps) {
  const greeting = name ? `Zdravo ${name},` : 'Zdravo,'

  return (
    <EmailLayout preview="Tvoj nalog je spreman. ZenFlow protokol počinje danas.">
      <Heading style={{ color: brand.ink, fontSize: 24, fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
        Dobrodošlica u ZenFlow
      </Heading>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
        {greeting}
      </Text>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
        Tvoj nalog je spreman. ZenFlow™ deluje kad se uzima svaki dan.{' '}
        <strong>Efekat se gradi iz dana u dan i slabi kad napraviš pauzu.</strong> Zato je
        najvažnije da doze uzimaš redovno i beležiš ih u aplikaciji.
      </Text>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 24px' }}>
        U aplikaciji beležiš doze i pratiš svoj niz. Pratiš i zalihe, pa ti javimo pre nego što
        ostaneš bez kapsula. Tu je i Pomodoro tajmer za rad u fokusu.
      </Text>

      <Section style={{ textAlign: 'center', margin: '8px 0 8px' }}>
        <Button href={`${APP_URL}/dashboard`} style={brandButtonStyle()}>
          Otvori aplikaciju
        </Button>
      </Section>
    </EmailLayout>
  )
}

export default WelcomeEmail
