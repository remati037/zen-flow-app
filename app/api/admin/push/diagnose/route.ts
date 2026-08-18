import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getCurrentProfile, requireAdmin } from '@/lib/auth'
import { db, notificationsLog, protocolLogs, pushSubscriptions } from '@/lib/db'
import { belgradeDayStart, belgradeTimeHM, belgradeToday, hmToMinutes } from '@/lib/dates'
import { filterNotifiedSince } from '@/lib/push/dedup'
import { inWindow, minutesToHm, reminderWindowStart } from '@/lib/push/dispatch-rules'
import { checkVapidConfig } from '@/lib/push/vapid'

export const runtime = 'nodejs'

const RECENT_LOG_LIMIT = 15

type DoseCheck = {
  dose: 'morning' | 'evening'
  time: string | null
  /** Prozor u kom bi podsetnik bio poslat, npr. '08:00–08:30'. */
  window: string | null
  inWindowNow: boolean
  alreadyTakenToday: boolean
  alreadyNotifiedToday: boolean
  /** Šta bi dispatcher uradio da se pokrene BAŠ SADA. */
  wouldSendNow: boolean
  reason: string
}

/**
 * Dijagnostika push lanca — jedan poziv koji kaže GDE lanac puca.
 *
 * Postoji jer je "notifikacija ne stiže" nemoguće razlikovati od "nema pretplate"
 * bez pogleda u server logove, a admin je u tom trenutku na telefonu. Vraća
 * stanje VAPID konfiguracije (uklj. proveru da se par ključeva poklapa),
 * pretplate ovog admina i poslednje redove iz `notifications_log`.
 *
 * NE otkriva tajne: pun endpoint pretplate je token, pa se vraća samo host.
 *
 * Pokretanje (kao ulogovan admin): GET /api/admin/push/diagnose
 */
export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FORBIDDEN'
    return new NextResponse(msg, { status: msg === 'UNAUTHENTICATED' ? 401 : 403 })
  }

  const profile = await getCurrentProfile()
  if (!profile) return new NextResponse('UNAUTHENTICATED', { status: 401 })

  const vapid = checkVapidConfig()

  const [subs, recent] = await Promise.all([
    db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, profile.id)),
    db
      .select({
        type: notificationsLog.type,
        channel: notificationsLog.channel,
        status: notificationsLog.status,
        sentAt: notificationsLog.sentAt,
      })
      .from(notificationsLog)
      .where(eq(notificationsLog.userId, profile.id))
      .orderBy(desc(notificationsLog.sentAt))
      .limit(RECENT_LOG_LIMIT),
  ])

  // ── Dry-run: šta bi dispatcher uradio za ovog admina baš sada ────────────
  // Iste funkcije koje koristi i cron ruta (lib/push/dispatch-rules), pa se
  // dijagnostika ne može raziću sa stvarnim ponašanjem.
  const today = belgradeToday()
  const nowHm = belgradeTimeHM()
  const nowMin = hmToMinutes(nowHm)

  const [todayLogs, notifiedMorning, notifiedEvening] = await Promise.all([
    db
      .select({ dose: protocolLogs.dose, status: protocolLogs.status })
      .from(protocolLogs)
      .where(and(eq(protocolLogs.userId, profile.id), eq(protocolLogs.date, today))),
    filterNotifiedSince({
      userIds: [profile.id],
      type: 'dose_reminder_morning',
      since: belgradeDayStart(),
      channel: 'push',
    }),
    filterNotifiedSince({
      userIds: [profile.id],
      type: 'dose_reminder_evening',
      since: belgradeDayStart(),
      channel: 'push',
    }),
  ])

  const takenToday = {
    morning: todayLogs.some((l) => l.dose === 'morning' && l.status === 'taken'),
    evening: todayLogs.some((l) => l.dose === 'evening' && l.status === 'taken'),
  }

  const eligible = profile.accessStatus !== 'inactive' && profile.onboardingCompleted

  const buildDoseCheck = (
    dose: 'morning' | 'evening',
    time: string | null,
    notified: boolean,
  ): DoseCheck => {
    const base = {
      dose,
      time,
      window: null as string | null,
      inWindowNow: false,
      alreadyTakenToday: takenToday[dose],
      alreadyNotifiedToday: notified,
      wouldSendNow: false,
    }

    if (!eligible) {
      return {
        ...base,
        reason: !profile.onboardingCompleted
          ? 'Onboarding nije završen — dispatcher preskače takve naloge.'
          : 'Nalog je `inactive` — dispatcher ne šalje neaktivnima.',
      }
    }
    if (!time) return { ...base, reason: 'Vreme doze nije podešeno u Podešavanjima.' }

    const start = reminderWindowStart(hmToMinutes(time))
    const window = `${minutesToHm(start)}–${minutesToHm(start + 30)}`
    const isIn = inWindow(nowMin, start)

    if (takenToday[dose]) {
      return { ...base, window, inWindowNow: isIn, reason: 'Doza je već označena kao uzeta danas.' }
    }
    if (notified) {
      return { ...base, window, inWindowNow: isIn, reason: 'Podsetnik je danas već poslat (dedup).' }
    }
    if (!isIn) {
      return {
        ...base,
        window,
        reason: `Trenutno je ${nowHm}, van prozora ${window}. Dispatcher šalje SAMO unutar prozora — ako se ne pokreće na 15 min, prozor se propusti.`,
      }
    }
    return { ...base, window, inWindowNow: true, wouldSendNow: true, reason: 'Poslao bi podsetnik odmah.' }
  }

  const doseChecks: DoseCheck[] = [
    buildDoseCheck('morning', profile.doseMorningTime, notifiedMorning.has(profile.id)),
    buildDoseCheck('evening', profile.doseEveningTime, notifiedEvening.has(profile.id)),
  ]

  const services = subs.map((s) => {
    try {
      return new URL(s.endpoint).host
    } catch {
      return 'nepoznat servis'
    }
  })

  // Redosled provera prati redosled kojim lanac može da pukne.
  const blockers: string[] = []
  if (vapid.problem) blockers.push(vapid.problem)
  if (subs.length === 0) {
    blockers.push(
      'Nemaš nijednu push pretplatu u bazi. Uključi "Push podsetnike" u Podešavanjima — ' +
        'na iOS-u tek POSLE dodavanja app-a na početni ekran (u Safariju Notification API ne postoji).',
    )
  }
  if (!process.env.CRON_SECRET) {
    blockers.push('CRON_SECRET nije postavljen — sve cron rute vraćaju 401, pa nema podsetnika za doze.')
  }

  const pushFailures = recent.filter((r) => r.channel === 'push' && r.status !== 'success').length
  const seenDoseReminders = recent.some((r) => r.type.startsWith('dose_reminder'))

  // Najvažniji zaključak: ako bi dispatcher poslao BAŠ SADA, a nijedan podsetnik
  // nikad nije poslat — ruta se ne poziva. To je scheduler, ne kod.
  if (doseChecks.some((c) => c.wouldSendNow) && !seenDoseReminders) {
    blockers.push(
      'Dispatcher bi TI POSLAO podsetnik upravo sada, ali nijedan podsetnik nikad nije zabeležen — ' +
        'znači /api/cron/notifications se ne poziva. Podesi eksterni scheduler na 15 min (docs/cron-setup.md); Vercel ovu rutu NE pokreće.',
    )
  } else if (!seenDoseReminders) {
    blockers.push(
      'Nijedan podsetnik za dozu nikad nije poslat. Ako je eksterni scheduler podešen, proveri da gađa ' +
        '/api/cron/notifications na 15 min sa tačnim "Authorization: Bearer <CRON_SECRET>" headerom.',
    )
  }

  return NextResponse.json({
    verdict: blockers.length === 0 ? 'ok' : 'blokirano',
    blockers,
    vapid: {
      publicKeySet: vapid.publicKeySet,
      privateKeySet: vapid.privateKeySet,
      publicKeyPrefix: vapid.publicKeyPrefix,
      pairMatches: vapid.pairMatches,
      subject: vapid.subject,
    },
    subscriptions: { count: subs.length, services },
    cronSecretSet: Boolean(process.env.CRON_SECRET),
    /**
     * Dispatcher za podsetnike NE vozi Vercel — vozi ga eksterni scheduler.
     * Ako ovde nema `dose_reminder_*` redova, scheduler najverovatnije nije podešen.
     */
    notificationsDispatcher: {
      note: 'Podsetnike za doze šalje /api/cron/notifications, koji mora da zove EKSTERNI scheduler na 15 min (docs/cron-setup.md). Vercel ga NE pokreće.',
      seenDoseReminders,
      now: nowHm,
      today,
      eligible,
      doseChecks,
    },
    recentNotifications: recent,
    recentPushFailures: pushFailures,
  })
}
