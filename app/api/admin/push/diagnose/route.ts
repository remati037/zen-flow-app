import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getCurrentProfile, requireAdmin } from '@/lib/auth'
import { CRON_JOBS, DISPATCHER_STALE_HOURS, describeDispatcherHealth } from '@/lib/cron/health'
import { readCronRun } from '@/lib/cron/heartbeat'
import { db, notificationsLog, protocolLogs, pushSubscriptions } from '@/lib/db'
import { belgradeDayStart, belgradeTimeHM, belgradeToday, hmToMinutes } from '@/lib/dates'
import { WINDOW_MIN, inWindow, minutesToHm, reminderWindowStart } from '@/lib/push/dispatch-rules'
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
  /** Kad je današnji podsetnik tog tipa poslat ('HH:mm' po Beogradu), ako jeste. */
  notifiedAt: string | null
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
      .select({ endpoint: pushSubscriptions.endpoint, lastSeenAt: pushSubscriptions.lastSeenAt })
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

  const [todayLogs, reminderLog, dispatcherRun] = await Promise.all([
    db
      .select({ dose: protocolLogs.dose, status: protocolLogs.status })
      .from(protocolLogs)
      .where(and(eq(protocolLogs.userId, profile.id), eq(protocolLogs.date, today))),
    // Današnji podsetnici koji TROŠE dedup slot — i `success` i `pending`.
    //
    // `pending` je rezervacija koja nije zatvorena (proces je pao između
    // `claimNotification` i `settleNotification`). Ona i dalje drži slot preko
    // `notifications_log_dedup_uq`, pa bi dijagnostika koja gleda samo `success`
    // rekla „nije poslato, poslao bi sada" dok dispatcher u stvari preskače —
    // tačno ono razilaženje između dijagnostike i rute koje ne smemo da imamo.
    db
      .select({
        type: notificationsLog.type,
        status: notificationsLog.status,
        sentAt: notificationsLog.sentAt,
      })
      .from(notificationsLog)
      .where(
        and(
          eq(notificationsLog.userId, profile.id),
          eq(notificationsLog.channel, 'push'),
          inArray(notificationsLog.status, ['success', 'pending']),
          gte(notificationsLog.sentAt, belgradeDayStart()),
        ),
      ),
    // Heartbeat dispatcher-a: jedini zapis koji postoji i kad run nije imao kome
    // da pošalje. Bez njega se „scheduler je mrtav" ne razlikuje od „nema kandidata".
    readCronRun(CRON_JOBS.notifications),
  ])

  const dispatcherHealth = describeDispatcherHealth({
    run: dispatcherRun,
    now: new Date(),
    windowMin: WINDOW_MIN,
  })

  const dedupSlotFor = (type: string): { at: string; status: string } | null => {
    const row = reminderLog.find((r) => r.type === type)
    if (!row) return null
    return {
      at: new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Belgrade',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(row.sentAt),
      status: row.status,
    }
  }

  const takenToday = {
    morning: todayLogs.some((l) => l.dose === 'morning' && l.status === 'taken'),
    evening: todayLogs.some((l) => l.dose === 'evening' && l.status === 'taken'),
  }

  const eligible = profile.accessStatus !== 'inactive' && profile.onboardingCompleted

  const buildDoseCheck = (dose: 'morning' | 'evening', time: string | null): DoseCheck => {
    const slot = dedupSlotFor(`dose_reminder_${dose}`)
    const notifiedAt = slot?.at ?? null
    const notified = slot !== null
    const base = {
      dose,
      time,
      window: null as string | null,
      inWindowNow: false,
      alreadyTakenToday: takenToday[dose],
      alreadyNotifiedToday: notified,
      notifiedAt,
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
    // Prozor MORA da se računa istim `WINDOW_MIN` kojim ga računa dispatcher.
    // Ranije je ovde stajalo hardkodovano `+ 30`, pa je dijagnostika prikazivala
    // lažan prozor čim se `NOTIFICATION_WINDOW_MIN` promeni — a onda „van prozora"
    // u dijagnostici ne bi značilo isto što i u ruti koja stvarno šalje.
    const window = `${minutesToHm(start)}–${minutesToHm(start + WINDOW_MIN)}`
    const isIn = inWindow(nowMin, start)

    if (takenToday[dose]) {
      return { ...base, window, inWindowNow: isIn, reason: 'Doza je već označena kao uzeta danas.' }
    }
    if (notified) {
      return {
        ...base,
        window,
        inWindowNow: isIn,
        reason:
          slot!.status === 'pending'
            ? `Rezervacija od ${notifiedAt} nije zatvorena — slanje je prekinuto u letu (timeout funkcije ili deploy usred run-a). Slot za danas je potrošen, pa dispatcher preskače. Oslobodi ga sa "Resetuj dedup za danas".`
            : `Podsetnik je danas već poslat u ${notifiedAt} — dedup blokira drugi isti dan. Promena vremena doze ga NE resetuje. Za ponovni test koristi "Resetuj dedup za danas".`,
      }
    }
    if (!isIn) {
      return {
        ...base,
        window,
        reason: `Trenutno je ${nowHm}, van prozora ${window} (širina ${WINDOW_MIN} min). Dispatcher šalje SAMO unutar prozora — ako se ne pokreće na 15 min, prozor se propusti.`,
      }
    }
    return { ...base, window, inWindowNow: true, wouldSendNow: true, reason: 'Poslao bi podsetnik odmah.' }
  }

  const doseChecks: DoseCheck[] = [
    buildDoseCheck('morning', profile.doseMorningTime),
    buildDoseCheck('evening', profile.doseEveningTime),
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

  // Najvažniji zaključak i najtiši otkaz: ruta se prosto ne poziva. Sada se meri
  // direktno (`cron_runs`), a ne nagađa iz odsustva podsetnika — run bez kandidata
  // ne upiše nijedan podsetnik, pa je stara heuristika lažno optuživala scheduler.
  // `gaps` nije totalni otkaz, ali jeste izgubljen podsetnik — i to mora da se vidi.
  if (dispatcherHealth.status !== 'ok') blockers.push(dispatcherHealth.message)

  if (dispatcherHealth.status !== 'never' && !seenDoseReminders) {
    blockers.push(
      'Dispatcher se poziva, ali nijedan podsetnik za dozu nikad nije poslat. To više NIJE scheduler — ' +
        'proveri vremena doza u Podešavanjima, da je onboarding završen i da postoji push pretplata.',
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
    subscriptions: {
      count: subs.length,
      services,
      /**
       * Kad je uređaj poslednji put POTVRDIO pretplatu (subscribe, re-upsert na
       * app load, ili rotacija endpoint-a). Star datum uz „0 podsetnika" znači da
       * korisnik odavno nije otvarao app — što je druga dijagnoza od mrtvog
       * endpoint-a, a bez ovog polja se ta dva ne razlikuju.
       */
      lastSeenAt: subs.map((s) => s.lastSeenAt.toISOString()),
    },
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
      windowMin: WINDOW_MIN,
      staleAfterHours: DISPATCHER_STALE_HOURS,
      /** Heartbeat: kad je ruta poslednji put pozvana i je li propuštala prozore. */
      health: dispatcherHealth,
      lastRunResult: dispatcherRun?.lastResult ?? null,
      doseChecks,
    },
    recentNotifications: recent,
    recentPushFailures: pushFailures,
  })
}
