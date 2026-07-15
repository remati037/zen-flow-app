import 'server-only'

import { and, eq, gte, inArray } from 'drizzle-orm'

import { db, notificationsLog } from '@/lib/db'
import { belgradeDayStart } from '@/lib/dates'
import type { NotificationType } from './types'

type Channel = 'push' | 'email'

/**
 * Bulk dedup: vraća `Set` `userId`-eva koji su već dobili uspešnu notifikaciju
 * datog `type` (i opciono `channel`) od `since` naovamo. Jedan query za sve
 * korisnike, pa `Set` provera u petlji — obrazac izvučen iz low-stock rute.
 *
 * `notifications_log` beleži i `success` i `failed`; dedup gleda samo `success`
 * da bi neuspeli pokušaj (npr. korisnik bez pretplate) mogao ponovo.
 */
export async function filterNotifiedSince({
  userIds,
  type,
  since,
  channel,
}: {
  userIds: string[]
  type: NotificationType
  since: Date
  channel?: Channel
}): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()

  const rows = await db
    .select({ userId: notificationsLog.userId })
    .from(notificationsLog)
    .where(
      and(
        inArray(notificationsLog.userId, userIds),
        eq(notificationsLog.type, type),
        eq(notificationsLog.status, 'success'),
        gte(notificationsLog.sentAt, since),
        ...(channel ? [eq(notificationsLog.channel, channel)] : []),
      ),
    )

  return new Set(rows.map((r) => r.userId))
}

/**
 * Da li je korisnik već obavešten datim tipom danas (od početka beogradskog dana).
 * Tanak wrapper nad `filterNotifiedSince` za pojedinačne provere.
 */
export async function wasNotifiedToday(
  userId: string,
  type: NotificationType,
  channel?: Channel,
): Promise<boolean> {
  const notified = await filterNotifiedSince({
    userIds: [userId],
    type,
    since: belgradeDayStart(),
    channel,
  })
  return notified.has(userId)
}
