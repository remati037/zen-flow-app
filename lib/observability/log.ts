/**
 * Strukturno logovanje — jedan JSON objekat po redu na stdout/stderr.
 *
 * Zašto ovo, a ne Sentry (O-M1): do sada je sve išlo kroz `console.error` sa
 * srpskim tekstom u sredini poruke. Takav log se ne može ni filtrirati ni
 * prebrojati — u Vercel log searchu „koliko je push slanja palo juče i zbog čega"
 * traži čitanje očima. JSON red je grep-abilan (`event:"push.send_failed"`),
 * agregabilan i spreman za log drain ako se ikad doda eksterni servis.
 *
 * Čist modul: bez `server-only` (importuje ga i QA), bez DB, bez zavisnosti.
 * Namerno NE koristi `Date.now()` u testabilnom putu — `ts` se uzima iz
 * `new Date().toISOString()`, što `scripts/qa-dates.mts` ume da zamrzne.
 *
 * ŠTA SE NE SME LOGOVATI: pun push endpoint (sadrži tajni token pretplate),
 * mejl adrese u slobodnom tekstu, sadržaj notifikacija. Za korisnika se loguje
 * `userId` (Clerk id) — dovoljan za korelaciju, nije lični podatak sam po sebi.
 */

export type LogLevel = 'info' | 'warn' | 'error'

/**
 * Vrednosti koje smeju u polje loga. Namerno usko: objekti bi se serijalizovali
 * u neprepoznatljive dubine, a `Error` ide kroz `errorFields` (poruka + ime).
 */
type LogValue = string | number | boolean | null | undefined

export type LogFields = Record<string, LogValue>

/**
 * Stabilna imena događaja. Slobodan string bi značio da se isti otkaz zove
 * `push_failed` na jednom i `pushFail` na drugom mestu, pa nijedan filter ne bi
 * hvatao oba — a filter je jedini razlog zbog kog ovaj modul postoji.
 */
export const EVENTS = {
  pushSendFailed: 'push.send_failed',
  pushConfigFailed: 'push.config_failed',
  pushEndpointBlocked: 'push.endpoint_blocked',
  emailSendFailed: 'email.send_failed',
  emailSkippedOptOut: 'email.skipped_opt_out',
  emailUnsubscribed: 'email.unsubscribed',
  lowStockCapped: 'low_stock.episode_capped',
  wooTopUpFailed: 'woo.top_up_failed',
  wooTopUpSkipped: 'woo.top_up_skipped',
  wooOrderSkipped: 'woo.order_skipped',
  wooOrderRevoked: 'woo.order_revoked',
  webhookFailed: 'webhook.failed',
  cronRun: 'cron.run',
  cronHeartbeatFailed: 'cron.heartbeat_failed',
  dailyReport: 'observability.daily_report',
  actionFailed: 'action.unhandled_error',
} as const

export type LogEvent = (typeof EVENTS)[keyof typeof EVENTS]

/**
 * Razloži `unknown` iz `catch` bloka u dva ravna polja.
 *
 * `catch (err)` daje `unknown`; `String(err)` na objektu daje `[object Object]`,
 * a `JSON.stringify(err)` na `Error`-u daje `{}` (poruka i stack nisu enumerable).
 * Zato se poruka vadi eksplicitno.
 */
export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) {
    return { errorName: err.name, errorMessage: err.message }
  }
  return { errorName: 'NonError', errorMessage: String(err) }
}

/** Jedan red JSON-a; `undefined` polja se izostavljaju da red ostane čitljiv. */
function emit(level: LogLevel, event: LogEvent, fields: LogFields): void {
  const payload: Record<string, LogValue> = {
    ts: new Date().toISOString(),
    level,
    event,
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) payload[key] = value
  }

  const line = JSON.stringify(payload)
  // `error` na stderr (Vercel ga boji i odvaja), ostalo na stdout.
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export function logInfo(event: LogEvent, fields: LogFields = {}): void {
  emit('info', event, fields)
}

export function logWarn(event: LogEvent, fields: LogFields = {}): void {
  emit('warn', event, fields)
}

/**
 * Greška + automatski razložen `unknown` iz `catch`-a.
 * `fields` pobeđuje nad izvedenim poljima (namerno — pozivalac zna više).
 */
export function logError(event: LogEvent, err: unknown, fields: LogFields = {}): void {
  emit('error', event, { ...errorFields(err), ...fields })
}
