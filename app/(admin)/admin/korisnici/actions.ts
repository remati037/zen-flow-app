'use server'

import { clerkClient } from '@clerk/nextjs/server'
import { isClerkAPIResponseError } from '@clerk/nextjs/errors'
import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { getLatestOrderDate, resolveAccessStatus } from '@/lib/access/status'
import { isWithinAccessWindow } from '@/lib/access/window'
import { createAction } from '@/lib/actions/safe-action'
import { ActionError } from '@/lib/actions/types'
import { belgradeToday, toBelgradeIso } from '@/lib/dates'
import { db, profiles } from '@/lib/db'
import { sendWelcomeEmail } from '@/lib/email/send'
import {
  getPendingInvitation,
  issueInvitation,
  revokeInvitation as revokeClerkInvitation,
  type IssueResult,
} from '@/lib/invitations/issue'
import { EVENTS, logInfo } from '@/lib/observability/log'
import { adminUserIdSchema, setAccessStatusSchema } from '@/lib/validations/admin'
import { adminInviteSchema, invitationIdSchema } from '@/lib/validations/invitations'

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

// ────────────────────────────────────────────────────────────
// Pozivnice (Clerk Restricted mod — vidi `lib/invitations/rules.ts`)
// ────────────────────────────────────────────────────────────

export type InviteResult = {
  email: string
  emailSent: boolean
  emailError?: string
  /** Link pozivnice — admin ga može kopirati ručno ako mejl ne stigne. */
  url: string | null
}

/**
 * Clerk greška → poruka za admina. Clerk-ove poruke su na engleskom, ali su
 * konkretne („email address is taken"), pa je bolje pokazati njih nego generičku.
 */
async function withClerkErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (isClerkAPIResponseError(err)) {
      const first = err.errors[0]
      throw new ActionError(`Clerk: ${first?.longMessage ?? first?.message ?? err.message}`)
    }
    throw err
  }
}

function toInviteResult(email: string, result: IssueResult): InviteResult {
  // Admin putanja nikad ne ide kroz cooldown (`skipCooldown` / `kind: 'admin'`).
  if (!result.issued) throw new ActionError('Pozivnica je upravo poslata — sačekaj par minuta.')
  return {
    email,
    emailSent: result.emailSent,
    emailError: result.emailError,
    url: result.invitation.url,
  }
}

async function assertNoAccount(email: string) {
  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(sql`lower(${profiles.email}) = ${email}`)
    .limit(1)
  if (existing) {
    throw new ActionError('Nalog sa tim mejlom već postoji — potraži ga u listi korisnika.')
  }
}

/**
 * Pozovi korisnika NEZAVISNO od porudžbina. Pri registraciji dobija trajan
 * `access_override = 'vip'` (Clerk webhook), koji se skida sa „Vrati automatiku".
 */
export const inviteUser = createAction(
  adminInviteSchema,
  async ({ email }, { profile: actor }): Promise<InviteResult> => {
    await assertNoAccount(email)
    const result = await withClerkErrors(() =>
      issueInvitation({ email, kind: 'admin', by: actor.id }),
    )
    revalidateAdmin()
    return toInviteResult(email, result)
  },
  { admin: true },
)

/** Novi link + nov mejl za postojeću pending pozivnicu (stari link prestaje da važi). */
export const resendInvitation = createAction(
  invitationIdSchema,
  async ({ invitationId }, { profile: actor }): Promise<InviteResult> => {
    const pending = await withClerkErrors(() => getPendingInvitation(invitationId))
    if (!pending) throw new ActionError('Pozivnica više nije aktivna (iskorišćena, opozvana ili istekla).')
    await assertNoAccount(pending.email)

    // Vrsta se čuva: kupčev link ostaje kupčev (bez VIP override-a), admin ostaje admin.
    const kind = pending.kind ?? 'admin'
    const result = await withClerkErrors(() =>
      issueInvitation({
        email: pending.email,
        kind,
        by: kind === 'admin' ? (pending.by ?? actor.id) : null,
        skipCooldown: true,
      }),
    )
    revalidateAdmin()
    return toInviteResult(pending.email, result)
  },
  { admin: true },
)

export const revokeInvitation = createAction(
  invitationIdSchema,
  async ({ invitationId }): Promise<{ revoked: true }> => {
    await withClerkErrors(() => revokeClerkInvitation(invitationId))
    revalidateAdmin()
    return { revoked: true }
  },
  { admin: true },
)

// ────────────────────────────────────────────────────────────
// Brisanje naloga
// ────────────────────────────────────────────────────────────

/**
 * Trajno briše nalog: Clerk korisnik + `profiles` red (FK `on delete cascade`
 * nosi protokol, zalihe, bedževe, push pretplate i log notifikacija).
 *
 * Profil se briše i ODMAH, ne samo kroz `user.deleted` webhook — lista mora da
 * ga ne prikazuje posle refresh-a, a webhook ume da kasni. Dvostruko brisanje je
 * bezbedno (drugo je no-op). Porudžbine u `orders` OSTAJU: vezane su za mejl, ne
 * za nalog, pa kupac može ponovo da zatraži link i nastavi sa istim pravom.
 *
 * Admin naloge i sopstveni nalog ne briše — rola se skida u Clerk Dashboard-u,
 * a brisanje sebe bi admina izbacilo iz aplikacije usred klika.
 */
export const deleteUser = createAction(
  adminUserIdSchema,
  async ({ userId }, { profile: actor }): Promise<{ deleted: true; email: string }> => {
    if (userId === actor.id) throw new ActionError('Ne možeš obrisati sopstveni nalog.')

    const [target] = await db
      .select({ id: profiles.id, email: profiles.email, role: profiles.role })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1)
    if (!target) throw new ActionError('Korisnik više ne postoji u bazi.')
    if (target.role === 'admin') {
      throw new ActionError('Nalog ima admin rolu — prvo mu skini rolu u Clerk Dashboard-u.')
    }

    const client = await clerkClient()
    try {
      await client.users.deleteUser(userId)
    } catch (err) {
      // 404 = korisnik je već obrisan u Clerk-u (ručno ili ranije) — profil svejedno čistimo.
      if (!(isClerkAPIResponseError(err) && err.status === 404)) {
        return withClerkErrors(() => Promise.reject(err))
      }
    }

    await db.delete(profiles).where(eq(profiles.id, userId))
    logInfo(EVENTS.userDeleted, { userId, by: actor.id })
    revalidateAdmin()
    return { deleted: true, email: target.email }
  },
  { admin: true },
)
