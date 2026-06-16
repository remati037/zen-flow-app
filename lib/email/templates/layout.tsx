import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { ReactNode } from 'react'

// Brand tokeni (vidi app/globals.css). Inline jer email klijenti ne podržavaju CSS varijable.
export const brand = {
  paper: '#ecf0f3',
  ink: '#203849',
  lime: '#defe9c',
  limeDeep: '#dcf39e',
  white: '#ffffff',
  muted: '#5b6b75',
  fontFamily:
    "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
}

type EmailLayoutProps = {
  preview: string
  children: ReactNode
}

/** Deljeni wrapper za sve transakcione mejlove — brand stil i footer. */
export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="sr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: brand.paper, fontFamily: brand.fontFamily, margin: 0, padding: '24px 0' }}>
        <Container
          style={{
            backgroundColor: brand.white,
            borderRadius: 20,
            maxWidth: 520,
            margin: '0 auto',
            padding: '40px 32px',
            boxShadow: '0 8px 30px rgba(32, 56, 73, 0.08)',
          }}
        >
          <Text style={{ color: brand.ink, fontSize: 18, fontWeight: 700, margin: '0 0 24px', letterSpacing: '-0.01em' }}>
            NuroLab <span style={{ color: brand.muted, fontWeight: 500 }}>· ZenFlow™</span>
          </Text>

          {children}

          <Hr style={{ borderColor: '#e3e8ec', margin: '32px 0 16px' }} />
          <Section>
            <Text style={{ color: brand.muted, fontSize: 12, lineHeight: '18px', margin: 0 }}>
              Ovaj mejl si dobio jer koristiš NuroLab Companion aplikaciju.
              <br />
              NuroLab · app.nurolab.rs
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

/** Lime CTA dugme u brand stilu. */
export function brandButtonStyle(): React.CSSProperties {
  return {
    backgroundColor: brand.lime,
    color: brand.ink,
    borderRadius: 999,
    fontSize: 15,
    fontWeight: 700,
    textDecoration: 'none',
    padding: '14px 28px',
    display: 'inline-block',
  }
}
