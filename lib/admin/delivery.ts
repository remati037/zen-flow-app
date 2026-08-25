import 'server-only'

import { gte, sql } from 'drizzle-orm'

import { BELGRADE_TZ, addDaysIso, belgradeToday } from '@/lib/dates'
import { db, notificationsLog } from '@/lib/db'
import type { IsoDate } from '@/lib/protocol/streak'

/**
 * Isporučenost notifikacija — agregat `notifications_log` po BEOGRADSKOM danu (O-M1).
 *
 * Zašto je ovo bilo neophodno: do sada je jedina mera bila „Notifikacije 7d" —
 * jedan zbir, bez podele po kanalu, tipu i danu. Sa njim se ne može odgovoriti na
 * pitanje koje se stvarno postavlja („da li su jutrošnji podsetnici izašli?"), niti
 * razlikovati tih otkaz jednog kanala od praznog dana. Agregat po danu × kanalu ×
 * statusu to čini vidljivim bez ijednog pogleda u Vercel logove.
 *
 * Grupisanje ide po `(sent_at at time zone 'Europe/Belgrade')::date`, ne po UTC danu:
 * podsetnik poslat u 00:10 po Beogradu je u UTC-u još „juče", pa bi UTC grupisanje
 * pomeralo pola večernjih podsetnika u pogrešnu kolonu — i to baš u onim satima
 * u kojima večernji dispatcher radi.
 */

/** Dužina serije na admin panelu. */
export const DELIVERY_SERIES_DAYS = 14

/** `pending` = rezervacija koja nikad nije zatvorena (prekinut run) — vidi `lib/push/dedup.ts`. */
export interface DeliveryCounts {
  success: number
  failed: number
  pending: number
}

export interface DeliveryDay {
  date: IsoDate
  push: DeliveryCounts
  email: DeliveryCounts
}

export interface DeliveryByType {
  type: string
  channel: 'push' | 'email'
  success: number
  failed: number
  pending: number
}

export interface DeliveryReport {
  windowDays: number
  days: DeliveryDay[]
  byType: DeliveryByType[]
  totals: DeliveryCounts
  /**
   * Udeo uspešnih u svemu što je pokušano, 0–100 (zaokruženo na jednu decimalu).
   * `null` kad u prozoru nema nijednog reda — 0% i „ništa se nije ni slalo" nisu
   * ista dijagnoza, a prikaz koji ih izjednači šalje admina da traži nepostojeći kvar.
   */
  successRate: number | null
  /** Nezatvorene rezervacije drže dedup slot — svaka je jedan propušten podsetnik. */
  stuckPending: number
}

function emptyCounts(): DeliveryCounts {
  return { success: 0, failed: 0, pending: 0 }
}

/** `status` je slobodan `text` u šemi; sve van tri poznata stanja se broji kao neuspeh. */
function bump(counts: DeliveryCounts, status: string, n: number): void {
  if (status === 'success') counts.success += n
  else if (status === 'pending') counts.pending += n
  else counts.failed += n
}

export async function getDeliveryReport(
  windowDays: number = DELIVERY_SERIES_DAYS,
): Promise<DeliveryReport> {
  const today = belgradeToday()
  const seriesStart = addDaysIso(today, -(windowDays - 1))

  // Granica je beogradska PONOĆ prvog dana serije, prevedena u instant — ista
  // konverzija koju radi i grupisanje ispod, pa ivica ne može da se raziđe.
  const since = sql<Date>`(${seriesStart}::date::timestamp at time zone ${BELGRADE_TZ})`
  const day = sql<string>`(${notificationsLog.sentAt} at time zone ${BELGRADE_TZ})::date`

  const [dayRows, typeRows] = await Promise.all([
    db
      .select({
        date: sql<string>`${day}::text`,
        channel: notificationsLog.channel,
        status: notificationsLog.status,
        count: sql<number>`count(*)::int`,
      })
      .from(notificationsLog)
      .where(gte(notificationsLog.sentAt, since))
      .groupBy(day, notificationsLog.channel, notificationsLog.status),

    db
      .select({
        type: notificationsLog.type,
        channel: notificationsLog.channel,
        status: notificationsLog.status,
        count: sql<number>`count(*)::int`,
      })
      .from(notificationsLog)
      .where(gte(notificationsLog.sentAt, since))
      .groupBy(notificationsLog.type, notificationsLog.channel, notificationsLog.status),
  ])

  // Rupe se popunjavaju nulama — dan bez ijednog reda mora da se VIDI kao nula,
  // ne da nestane iz serije. Nestali dan izgleda kao da ga nije ni bilo; nula
  // izgleda kao otkaz, i to je tačno ono što jeste ako je taj dan imao kandidate.
  const byDate = new Map<string, DeliveryDay>()
  for (let i = windowDays - 1; i >= 0; i--) {
    const date = addDaysIso(today, -i)
    byDate.set(date, { date, push: emptyCounts(), email: emptyCounts() })
  }

  const totals = emptyCounts()
  for (const row of dayRows) {
    const entry = byDate.get(row.date)
    const n = Number(row.count)
    if (entry) bump(row.channel === 'email' ? entry.email : entry.push, row.status, n)
    bump(totals, row.status, n)
  }

  const typeMap = new Map<string, DeliveryByType>()
  for (const row of typeRows) {
    const key = `${row.type}::${row.channel}`
    const entry = typeMap.get(key) ?? {
      type: row.type,
      channel: row.channel,
      success: 0,
      failed: 0,
      pending: 0,
    }
    const counts: DeliveryCounts = {
      success: entry.success,
      failed: entry.failed,
      pending: entry.pending,
    }
    bump(counts, row.status, Number(row.count))
    typeMap.set(key, { ...entry, ...counts })
  }

  const attempted = totals.success + totals.failed + totals.pending

  return {
    windowDays,
    days: [...byDate.values()],
    byType: [...typeMap.values()].sort((a, b) => b.success + b.failed - (a.success + a.failed)),
    totals,
    successRate: attempted === 0 ? null : Math.round((totals.success / attempted) * 1000) / 10,
    stuckPending: totals.pending,
  }
}
