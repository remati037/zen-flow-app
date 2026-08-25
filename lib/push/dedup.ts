import 'server-only'

import { and, eq, gte, inArray, sql } from 'drizzle-orm'

import { db, notificationsLog } from '@/lib/db'
import { belgradeDayStart } from '@/lib/dates'
import { EVENTS, logError } from '@/lib/observability/log'
import type { NotificationType } from './types'

export type Channel = 'push' | 'email'

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

/**
 * Da li je korisnik IKAD dobio uspešnu notifikaciju datog tipa na datom kanalu.
 *
 * Za jednokratne mejlove (`welcome`) — tu „danas" nema smisla, poruka ide jednom
 * u životu naloga. Clerk webhook je pozivalac: `user.created` stiže ponovo na
 * svaki retry, a `onConflictDoNothing` je ranije značio da se ceo blok preskoči.
 */
export async function hasEverNotified(
  userId: string,
  type: NotificationType,
  channel: Channel,
): Promise<boolean> {
  const rows = await db
    .select({ id: notificationsLog.id })
    .from(notificationsLog)
    .where(
      and(
        eq(notificationsLog.userId, userId),
        eq(notificationsLog.type, type),
        eq(notificationsLog.channel, channel),
        eq(notificationsLog.status, 'success'),
      ),
    )
    .limit(1)

  return rows.length > 0
}

// ────────────────────────────────────────────────────────────
// Rezervacija (insert-PRE-slanja) — atomarni deo dedup-a
// ────────────────────────────────────────────────────────────

/**
 * Rezerviši slanje za (korisnik, tip, kanal, beogradski dan).
 *
 * Vraća `id` reda kad je rezervacija NAŠA, ili `null` kad je neko drugi već
 * uzeo taj slot — pozivalac tada NE ŠALJE.
 *
 * Zašto rezervacija, a ne provera-pa-slanje: `filterNotifiedSince` čita stanje
 * pre slanja, a red se upisuje posle. Između ta dva trenutka stane ceo drugi run
 * dispatchera (prozor je 45 min, kadenca 15, a GitHub Actions ume da pokrene dva
 * posla u istom prozoru) — obe provere prođu, oba run-a pošalju, korisnik dobije
 * dupli podsetnik. Jedinstveni PARCIJALNI indeks `notifications_log_dedup_uq`
 * ovde presuđuje atomarno: prvi insert prolazi, drugi pada u `do nothing` i
 * vraća 0 redova.
 *
 * `on conflict` mora da ponovi predikat parcijalnog indeksa (`where dedup_day is
 * not null`), inače Postgres ne ume da izabere arbitra i baca
 * "there is no unique or exclusion constraint matching the ON CONFLICT specification".
 *
 * Raw SQL, a ne drizzle builder: `onConflictDoNothing` sa parcijalnim indeksom
 * traži tačno pozicioniran `where`, i lakše je pogrešiti nego pročitati.
 */
export async function claimNotification({
  userId,
  type,
  channel,
  day,
}: {
  userId: string
  /** Slobodan string kao i u `sendPushToUser`/`sendEmail` (kolona je `text`). */
  type: string
  channel: Channel
  /** Beogradski kalendarski dan ('YYYY-MM-DD') — uvek `belgradeToday()`. */
  day: string
}): Promise<number | null> {
  const res = await db.execute<{ id: number }>(sql`
    insert into ${notificationsLog} ("user_id", "type", "channel", "status", "dedup_day")
    values (${userId}, ${type}, ${channel}, 'pending', ${day}::date)
    on conflict ("user_id", "type", "channel", "dedup_day") where "dedup_day" is not null
    do nothing
    returning "id"
  `)

  const row = res.rows[0]
  return row ? Number(row.id) : null
}

/**
 * Zatvori rezervaciju posle pokušaja slanja.
 *
 * `success` → red ostaje sa `dedup_day`, pa slot za taj dan ostaje potrošen
 * (to i hoćemo — poslato je).
 *
 * `failed` → red OSLOBAĐA slot (`dedup_day = null`) i ostaje u istoriji kao
 * neuspeh. Time se čuva staro pravilo iz `filterNotifiedSince`: neuspelo slanje
 * ne sme da „pojede" dan, jer bi korisnik kome je push servis vratio 500 ostao
 * bez podsetnika do sutra. Sledeći run sme ponovo da rezerviše.
 *
 * TRADE-OFF koji ovo NE rešava: ako proces umre IZMEĐU rezervacije i ovog poziva
 * (timeout funkcije, deploy usred run-a), red ostaje `pending` sa popunjenim
 * `dedup_day` i taj slot je potrošen — korisnik tog dana ne dobija taj podsetnik,
 * iako možda ništa nije poslato. Izbor je svestan: jedan propušten podsetnik je
 * manja šteta od duplikata (duplikat je razlog zbog kog korisnici gase push).
 * `pending` red je i vidljiv trag — vidi se u dijagnostici, a admin ga briše sa
 * „Resetuj dedup za danas" (`/api/admin/push/reset-dedup`).
 *
 * NIKAD ne baca: neuspeh upisa ne sme da obori run koji je upravo poslao push.
 */
export async function settleNotification(id: number, ok: boolean): Promise<void> {
  try {
    await db
      .update(notificationsLog)
      .set(ok ? { status: 'success' } : { status: 'failed', dedupDay: null })
      .where(eq(notificationsLog.id, id))
  } catch (err) {
    // Nezatvorena rezervacija ostaje `pending` i DRŽI dedup slot — to je propušten
    // podsetnik, pa mora da bude vidljivo kao greška, ne kao šum u konzoli.
    logError(EVENTS.pushSendFailed, err, { stage: 'settle_claim', claimId: id, ok })
  }
}
