import { belgradeTimeHM, daysBetweenIso, formatIsoDateSr } from '@/lib/dates'

/** Granice pozdrava po beogradskom satu: 5–11 jutro, 12–17 popodne, ostalo veče. */
function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Dobro jutro'
  if (hour < 18) return 'Dobar dan'
  return 'Dobro veče'
}

/**
 * Pozdrav + koji je dan protokola po redu ("dan 12 protokola").
 * Dan 1 = `protocolStartDate`. Ako je start u budućnosti (korisnik je u
 * onboardingu izabrao kasniji datum), umesto brojača ide datum starta.
 */
export function GreetingHeader({
  name,
  protocolStartDate,
  today,
}: {
  name: string | null
  protocolStartDate: string | null
  today: string
}) {
  const hour = Number(belgradeTimeHM().slice(0, 2))
  const firstName = name?.trim().split(/\s+/)[0] ?? null
  const dayNumber = protocolStartDate ? daysBetweenIso(protocolStartDate, today) + 1 : null

  let subline: string
  if (protocolStartDate === null || dayNumber === null) {
    subline = 'Podesi protokol da krene brojanje dana.'
  } else if (dayNumber < 1) {
    subline = `Protokol kreće ${formatIsoDateSr(protocolStartDate)}`
  } else if (dayNumber === 1) {
    subline = 'Dan 1 protokola. Počni od jutarnje doze.'
  } else {
    subline = `Dan ${dayNumber} protokola`
  }

  const dateLabel = formatIsoDateSr(today, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <header className="pt-1">
      <p className="text-xs font-medium tracking-[0.14em] text-slate-soft uppercase">{dateLabel}</p>
      <h1 className="mt-2 font-heading text-3xl leading-tight font-medium tracking-[-0.03em] text-ink">
        {greeting(hour)}
        {firstName ? `, ${firstName}` : ''}
      </h1>
      <p className="mt-1 text-sm text-slate-mid">{subline}</p>
    </header>
  )
}
