import { Button, Heading, Link, Section, Text } from '@react-email/components'

import { brand, brandButtonStyle, EmailLayout } from './layout'

type InvitationEmailProps = {
  /** Clerk invitation link (nosi `__clerk_ticket`). */
  url: string
  /** `admin` = lična pozivnica; `buyer` = kupac je sam tražio link na `/sign-up`. */
  kind: 'admin' | 'buyer'
  expiresInDays: number
}

/**
 * Pozivnica za registraciju — jedini put do naloga (Clerk Restricted mod).
 * Ćirilica/dijakritici idu kroz `@react-email` render u UTF-8, bez ručnog encodinga.
 */
export function InvitationEmail({ url, kind, expiresInDays }: InvitationEmailProps) {
  const intro =
    kind === 'admin'
      ? 'Pozvan si u NuroLab Companion — aplikaciju koja prati tvoj ZenFlow™ protokol: dnevne doze, streak, zalihe i fokus blokove.'
      : 'Stigao je zahtev za registraciju u NuroLab Companion sa ovog mejla. Pošto si ZenFlow™ kupac, nalog možeš da napraviš odmah.'

  return (
    <EmailLayout preview="Tvoj link za registraciju u NuroLab Companion.">
      <Heading style={{ color: brand.ink, fontSize: 24, fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
        {kind === 'admin' ? 'Pozivnica za NuroLab 🌿' : 'Tvoj link za registraciju 🌿'}
      </Heading>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' }}>
        Zdravo,
      </Text>

      <Text style={{ color: brand.ink, fontSize: 15, lineHeight: '24px', margin: '0 0 24px' }}>
        {intro}
      </Text>

      <Section style={{ textAlign: 'center', margin: '8px 0 24px' }}>
        <Button href={url} style={brandButtonStyle()}>
          Napravi nalog
        </Button>
      </Section>

      <Text style={{ color: brand.muted, fontSize: 13, lineHeight: '20px', margin: '0 0 8px' }}>
        Link važi {expiresInDays} {expiresInDays === 1 ? 'dan' : 'dana'} i radi samo za ovu mejl
        adresu. Ako dugme ne radi, otvori ovaj link:
      </Text>
      <Text style={{ fontSize: 12, lineHeight: '18px', margin: '0 0 16px', wordBreak: 'break-all' }}>
        <Link href={url} style={{ color: brand.ink }}>
          {url}
        </Link>
      </Text>

      <Text style={{ color: brand.muted, fontSize: 13, lineHeight: '20px', margin: 0 }}>
        Ako nisi ti tražio ovaj mejl, slobodno ga ignoriši — bez klika na link nalog se ne pravi.
      </Text>
    </EmailLayout>
  )
}

export default InvitationEmail
