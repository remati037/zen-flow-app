/**
 * Objekti koje svaka migracija uvodi — JEDAN spisak, dva potrošača.
 *
 * Čita ga `scripts/db-status.mts` (lokalno, protiv proizvoljne baze) i
 * `/api/cron/db-check` (na produkciji, protiv baze na koju je aplikacija STVARNO
 * spojena). Bez zajedničkog spiska bi se ta dva izvora razišla, a upravo je
 * razilaženje između „baze koju sam migrirao" i „baze koju aplikacija koristi"
 * uzrok incidenta zbog kog ovaj fajl postoji.
 *
 * Čist modul: bez `server-only`, bez DB importa.
 */

export type SchemaObject =
  | { tag: string; kind: 'table'; table: string }
  | { tag: string; kind: 'column'; table: string; column: string }
  | { tag: string; kind: 'index'; index: string }

/**
 * Sve posle bazne migracije 0000 — to su objekti koje produkcija ume da nema.
 *
 * Spisak MORA biti potpun: `scripts/qa-sql.mts` parsira migracione fajlove i pada
 * ako neki `ADD COLUMN` / `CREATE TABLE` / `CREATE INDEX` ovde nedostaje. Bez te
 * provere je spisak tiho zaostajao — prva verzija je propuštala šest indeksa, pa
 * ih `db-check` ne bi prijavio ni da fale na produkciji.
 */
export const EXPECTED_SCHEMA: SchemaObject[] = [
  { tag: '0001', kind: 'index', index: 'orders_email_lower_date_idx' },
  { tag: '0001', kind: 'index', index: 'protocol_logs_date_taken_idx' },
  { tag: '0001', kind: 'index', index: 'daily_tasks_user_date_idx' },
  { tag: '0001', kind: 'index', index: 'focus_quiz_results_user_date_idx' },
  { tag: '0001', kind: 'index', index: 'focus_sessions_user_idx' },
  { tag: '0001', kind: 'index', index: 'notifications_log_user_type_status_sent_idx' },
  { tag: '0002', kind: 'table', table: 'cron_runs' },
  { tag: '0003', kind: 'column', table: 'notifications_log', column: 'dedup_day' },
  { tag: '0003', kind: 'column', table: 'push_subscriptions', column: 'last_seen_at' },
  { tag: '0003', kind: 'index', index: 'notifications_log_dedup_uq' },
  { tag: '0003', kind: 'index', index: 'push_subscriptions_user_idx' },
  { tag: '0004', kind: 'column', table: 'profiles', column: 'access_override' },
  { tag: '0004', kind: 'column', table: 'profiles', column: 'access_override_at' },
  { tag: '0004', kind: 'column', table: 'profiles', column: 'access_override_by' },
  { tag: '0004', kind: 'column', table: 'profiles', column: 'email_alerts' },
  { tag: '0004', kind: 'column', table: 'supply', column: 'low_stock_alerts_sent' },
]

/** Čitljiv opis jednog objekta — isti tekst u skripti i u ruti. */
export function describeSchemaObject(o: SchemaObject): string {
  if (o.kind === 'table') return `tabela ${o.table}`
  if (o.kind === 'index') return `index ${o.index}`
  return `${o.table}.${o.column}`
}

/**
 * Host + ime baze iz connection stringa, BEZ kredencijala.
 *
 * Ovo je najvažniji podatak u celoj dijagnostici: incident je nastao jer se
 * migriralo na jednu bazu, a aplikacija je bila spojena na drugu. Lozinka se
 * nikad ne ispisuje — samo koja je baza.
 */
export function describeDatabaseTarget(raw: string | undefined): string {
  if (!raw) return '(DATABASE_URL nije postavljen)'
  try {
    const u = new URL(raw)
    return `${u.host}${u.pathname}`
  } catch {
    return '(neparsabilan DATABASE_URL)'
  }
}
