import 'server-only'

import { clerkClient } from '@clerk/nextjs/server'
import { sql } from 'drizzle-orm'

import { isKnownBuyer, type AccessStatus, type Role } from '@/lib/access/status'
import { APP_URL } from '@/lib/app-url'
import { db, orders, profiles } from '@/lib/db'
import { EMAIL_FROM, getResend } from '@/lib/email/client'
import { listPendingInvitationsFor, type PendingInvitation } from '@/lib/invitations/issue'
import {
  decideSignUpRequest,
  normalizeEmail,
  senderDomain,
  type SignUpDecision,
} from '@/lib/invitations/rules'
import { isAccessGrantingStatus } from '@/lib/woocommerce/order-rules'

/**
 * „Proveri mejl" — zašto (ne) stiže link za registraciju.
 *
 * Javna forma na `/sign-up` NAMERNO uvek kaže isto, pa „mejl nije stigao" ima
 * pet uzroka koji izgledaju identično: nalog već postoji, mejl nije kupac,
 * cooldown, Clerk odbija pozivnicu, Resend odbija pošiljaoca. Ovo ih razdvaja
 * ISTIM pravilima koja koristi forma (`decideSignUpRequest`) i nad bazom na koju
 * je aplikacija stvarno spojena — ne nad lokalnom.
 *
 * Svaki eksterni korak (Clerk, Resend) se hvata zasebno: dijagnostika koja pukne
 * baš na koraku koji je pokvaren ne dijagnostikuje ništa.
 */

export type OrderStatusSummary = {
  status: string
  count: number
  latest: Date
  grantsAccess: boolean
}

export type CheckState<T> = { ok: true; value: T } | { ok: false; error: string }

export type SignUpDiagnosis = {
  email: string
  account: { userId: string; role: Role; accessStatus: AccessStatus } | null
  /**
   * Clerk korisnik sa ovim mejlom. Postoji + nema profila = `user.created` webhook
   * nije stigao: Clerk ga smatra registrovanim, a aplikacija ne zna za njega.
   */
  clerkUser: CheckState<{ exists: boolean; userId: string | null }>
  orders: OrderStatusSummary[]
  isBuyer: boolean
  pending: CheckState<PendingInvitation[]>
  /** Šta bi forma uradila SADA. `null` kad Clerk nije odgovorio (cooldown se ne zna). */
  decision: SignUpDecision | null
  config: {
    appUrl: string
    /** Link u pozivnici vodi ovde — localhost/http na produkciji znači mrtav link. */
    appUrlLooksProduction: boolean
    emailFrom: string
    senderDomain: string | null
    resendDomain: CheckState<{ status: string; name: string } | null>
    clerkInstance: 'development' | 'production' | 'nepoznato'
    /**
     * Sign-up mod instance (`public` | `restricted` | `waitlist`) — BRAVA cele
     * registracije. Bez `restricted` Clerk pušta registraciju i bez pozivnice.
     */
    clerkSignUpMode: CheckState<string>
  }
}

/** Porudžbine po statusu — GROUP BY nad običnom kolonom, bez bind parametra u izrazu. */
export async function getOrderStatusSummary(email: string): Promise<OrderStatusSummary[]> {
  const rows = await db
    .select({
      status: orders.status,
      count: sql<number>`count(*)::int`,
      latest: sql<Date>`max(${orders.orderDate})`.mapWith((v) => new Date(v)),
    })
    .from(orders)
    .where(sql`lower(${orders.email}) = ${normalizeEmail(email)}`)
    .groupBy(orders.status)

  return rows
    .map((r) => ({ ...r, grantsAccess: isAccessGrantingStatus(r.status) }))
    .sort((a, b) => b.latest.getTime() - a.latest.getTime())
}

function errorText(err: unknown): string {
  if (err && typeof err === 'object' && 'errors' in err) {
    const first = (err as { errors?: { longMessage?: string; message?: string }[] }).errors?.[0]
    if (first) return first.longMessage ?? first.message ?? 'Clerk greška'
  }
  return err instanceof Error ? err.message : String(err)
}

async function check<T>(fn: () => Promise<T>): Promise<CheckState<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    return { ok: false, error: errorText(err) }
  }
}

/**
 * Clerk Frontend API host iz publishable key-a (`pk_<env>_<base64(host$)>`) —
 * ista derivacija kao CSP u `next.config.ts`.
 */
function clerkFrontendApiHost(): string | null {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  if (!pk) return null
  const decoded = Buffer.from(pk.replace(/^pk_(test|live)_/, ''), 'base64')
    .toString('utf8')
    .replace(/\$$/, '')
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(decoded) ? decoded : null
}

/**
 * Sign-up mod iz JAVNOG Frontend API-ja (`/v1/environment`, isti poziv koji radi
 * Clerk-ov browser SDK). Backend API ga ne izlaže, a bez ovoga admin ne može iz
 * aplikacije da vidi da li je Restricted stvarno uključen na ovoj instanci.
 */
export async function clerkSignUpMode(): Promise<string> {
  const host = clerkFrontendApiHost()
  if (!host) throw new Error('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY nije postavljen ili je neispravan')
  const res = await fetch(`https://${host}/v1/environment`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`Clerk Frontend API: HTTP ${res.status}`)
  const body = (await res.json()) as { user_settings?: { sign_up?: { mode?: unknown } } }
  const mode = body.user_settings?.sign_up?.mode
  if (typeof mode !== 'string') throw new Error('Clerk nije vratio sign-up mod')
  return mode
}

function clerkInstance(): SignUpDiagnosis['config']['clerkInstance'] {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''
  if (key.startsWith('pk_live_')) return 'production'
  if (key.startsWith('pk_test_')) return 'development'
  return 'nepoznato'
}

/**
 * Status pošiljaočevog domena u Resend-u. Resend verifikuje TAČAN domen —
 * verifikovan `nurolab.rs` ne pokriva `app.nurolab.rs`. Ključ sa „Sending
 * access" dozvolom ne sme da lista domene; tada se vraća greška, ne laž.
 */
async function resendDomainStatus(domain: string | null) {
  if (!domain) return null
  const { data, error } = await getResend().domains.list()
  if (error) throw new Error(error.message)
  const match = data?.data.find((d) => d.name.toLowerCase() === domain)
  return match ? { status: match.status, name: match.name } : null
}

export async function diagnoseSignUpEmail(rawEmail: string): Promise<SignUpDiagnosis> {
  const email = normalizeEmail(rawEmail)
  const domain = senderDomain(EMAIL_FROM)

  const [[account], orderSummary, isBuyer, clerkUser, pending, resendDomain, signUpMode] = await Promise.all([
    db
      .select({ userId: profiles.id, role: profiles.role, accessStatus: profiles.accessStatus })
      .from(profiles)
      .where(sql`lower(${profiles.email}) = ${email}`)
      .limit(1),
    getOrderStatusSummary(email),
    isKnownBuyer(email),
    check(async () => {
      const client = await clerkClient()
      const { data } = await client.users.getUserList({ emailAddress: [email], limit: 1 })
      return { exists: data.length > 0, userId: data[0]?.id ?? null }
    }),
    check(() => listPendingInvitationsFor(email)),
    check(() => resendDomainStatus(domain)),
    check(clerkSignUpMode),
  ])

  const decision = pending.ok
    ? decideSignUpRequest({
        hasAccount: Boolean(account),
        isBuyer,
        newestPendingCreatedAtMs: pending.value.reduce<number | null>(
          (max, inv) => Math.max(max ?? 0, inv.createdAt.getTime()),
          null,
        ),
        nowMs: Date.now(),
      })
    : null

  return {
    email,
    account: account ?? null,
    clerkUser,
    orders: orderSummary,
    isBuyer,
    pending,
    decision,
    config: {
      appUrl: APP_URL,
      appUrlLooksProduction: APP_URL.startsWith('https://') && !APP_URL.includes('localhost'),
      emailFrom: EMAIL_FROM,
      senderDomain: domain,
      resendDomain,
      clerkInstance: clerkInstance(),
      clerkSignUpMode: signUpMode,
    },
  }
}
