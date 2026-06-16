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
    <EmailLayout preview="Dobrodošao u NuroLab — tvoj ZenFlow protokol počinje danas.">
      <Heading style={{ color: brand.ink, fontSize: 24, fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
        Dobrodošao u NuroLab 🌿
      </Heading>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
        {greeting}
      </Text>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
        Tvoj nalog je spreman. ZenFlow™ radi po jednostavnom principu:{' '}
        <strong>efekti se grade dnevnom doslednošću, a blede kad se protokol prekine.</strong> Zato
        je najvažnije da svaki dan zabeležiš svoju dozu i održavaš streak.
      </Text>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 24px' }}>
        U aplikaciji te čeka: protocol tracker sa streak mehanikom, praćenje zaliha sa alertima
        pre nego što ostaneš bez kapsula, i Pomodoro timer za fokusirane blokove.
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
