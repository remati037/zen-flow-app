'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { getLatestOrderDate, resolveAccessStatus } from '@/lib/access/status'
import { isWithinAccessWindow } from '@/lib/access/window'
import { createAction } from '@/lib/actions/safe-action'
import { belgradeToday, toBelgradeIso } from '@/lib/dates'
import { db, profiles } from '@/lib/db'
import { sendWelcomeEmail } from '@/lib/email/send'
import { adminUserIdSchema, setAccessStatusSchema } from '@/lib/validations/admin'

function revalidateAdmin() {
  revalidatePath('/admin/korisnici')
  revalidatePath('/admin')
}

export type SetAccessStatusResult =
  | { applied: false; reason: 'not-found' }
  | {
      applied: true
      email: string
      /** Efektivni `access_status` posle izmene — ono što korisnik stvarno vidi. */
      status: 'vip' | 'inactive' | 'subscriber'
      /** Vrednost override-a posle izmene; `null` kad je nalog vraćen pod automatiku. */
      override: 'vip' | 'inactive' | null
      /** Ima li porudžbinu u VIP prozoru — objašnjava šta radi automatika bez override-a. */
      hasOrderInWindow: boolean
      /**
       * `true` kad je meta bio admin: rola je izvor istine i `resolveAccessStatus`
       * ga svodi na `vip`, pa override na `inactive` NEMA efekta. UI to mora reći —
       * inače admin misli da je nalog blokirao, a nije.
       */
      roleOverridesChoice: boolean
    }

/**
 * Ručni override pristupa (L-M2).
 *
 * Piše u `profiles.access_override` — zasebnu kolonu, NE u `access_status`.
 * Zašto: `access_status` je IZVEDENA vrednost koju `refreshAccessStatusForProfile`
 * prepisuje na svaki ulaz korisnika u app i na svaku server akciju. Dok je override
 * pisao u nju, prvi sledeći page load korisnika ga je poništavao — u oba smera, a
 * gori smer je bio `inactive` (admin blokira nalog, korisnik osveži i opet je VIP).
 * Override sada preživljava i refresh i noćni cron (`maintainAccessStatuses` preskače
 * redove sa override-om), dok ga admin ne skine sa `auto`.
 *
 * `access_status` se u istoj izjavi usklađuje sa novom odlukom, da lista i gejt ne
 * čekaju sledeći refresh.
 */
export const setUserAccessStatus = createAction(
  setAccessStatusSchema,
  async ({ userId, status }, { profile: actor }): Promise<SetAccessStatusResult> => {
    const [target] = await db
      .select({
        id: profiles.id,
        email: profiles.email,
        role: profiles.role,
        accessStatus: profiles.accessStatus,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1)

    if (!target) return { applied: false, reason: 'not-found' }

    const override = status === 'auto' ? null : status
    const latestOrderDate = await getLatestOrderDate(target.email)
    const hasOrderInWindow = Boolean(
      latestOrderDate && isWithinAccessWindow(toBelgradeIso(latestOrderDate), belgradeToday()),
    )

    // ISTA funkcija koju zovu gejt u layout-u i `createAction` — da admin lista i
    // stvarni pristup ne mogu da se raziđu. Bez override-a odlučuje porudžbina.
    // `currentStatus` je stvarni status mete, ne konstanta: `resolveAccessStatus`
    // preko njega čuva `subscriber` (Faza 2 / Stripe). Sa `'inactive'` bi klik na
    // „Vrati automatiku" tiho oborio pretplatnika koji nema Woo porudžbinu.
    const effective = resolveAccessStatus({
      role: target.role,
      currentStatus: target.accessStatus,
      latestOrderDate,
      now: new Date(),
      override,
    })

    await db
      .update(profiles)
      .set({
        accessOverride: override,
        // Vreme i autor prate SAMO postojeći override; brisanje ih čisti, da stari
        // potpis ne visi uz nalog koji više nije override-ovan.
        accessOverrideAt: override ? new Date() : null,
        accessOverrideBy: override ? actor.id : null,
        accessStatus: effective,
      })
      .where(eq(profiles.id, userId))

    revalidateAdmin()

    return {
      applied: true,
      email: target.email,
      status: effective,
      override,
      hasOrderInWindow,
      roleOverridesChoice: target.role === 'admin' && override === 'inactive',
    }
  },
  { admin: true },
)

export type ResendWelcomeResult =
  | { sent: false; reason: 'not-found' | 'send-failed'; error?: string }
  | { sent: true; email: string }

/** Ponovo pošalje welcome mejl (isti šablon i logovanje kao Clerk `user.created`). */
export const resendWelcomeEmail = createAction(
  adminUserIdSchema,
  async ({ userId }): Promise<ResendWelcomeResult> => {
    const [target] = await db
      .select({ id: profiles.id, email: profiles.email, name: profiles.name })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1)

    if (!target) return { sent: false, reason: 'not-found' }

    const result = await sendWelcomeEmail(target)
    // sendEmail uvek upiše red u notifications_log → osveži metrike.
    revalidateAdmin()

    if (!result.ok) return { sent: false, reason: 'send-failed', error: result.error }
    return { sent: true, email: target.email }
  },
  { admin: true },
)
