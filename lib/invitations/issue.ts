import 'server-only'

import { clerkClient } from '@clerk/nextjs/server'

import { APP_URL } from '@/lib/app-url'
import { sendInvitationEmail } from '@/lib/email/send'
import { EVENTS, logError, logInfo } from '@/lib/observability/log'

import {
  ADMIN_INVITE_EXPIRES_DAYS,
  BUYER_INVITE_EXPIRES_DAYS,
  canReissueBuyerInvite,
  inviteMetadata,
  normalizeEmail,
  parseInviteMetadata,
  type InviteKind,
} from './rules'

/**
 * Izdavanje Clerk pozivnica — JEDINI put kojim nastaje nalog (Clerk je u
 * Restricted sign-up modu). Pravila i oblik metapodataka su u `./rules.ts`.
 *
 * Clerk-ov mejl je ugašen (`notify: false`): šaljemo svoj, na srpskom i u brand
 * šablonu, preko Resend-a. Link (`invitation.url`) nosi `__clerk_ticket`, koji
 * `<SignUp />` sam prepozna — mejl je tim tiketom već verifikovan.
 */

export type PendingInvitation = {
  id: string
  email: string
  kind: InviteKind | null
  /** Clerk id admina koji je pozvao (samo za `admin` pozivnice). */
  by: string | null
  createdAt: Date
  /** Približno — Clerk ne izlaže `expires_at`, računa se iz vrste pozivnice. */
  expiresAt: Date | null
  url: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function expiresInDays(kind: InviteKind): number {
  return kind === 'admin' ? ADMIN_INVITE_EXPIRES_DAYS : BUYER_INVITE_EXPIRES_DAYS
}

type ClerkInvitation = Awaited<
  ReturnType<Awaited<ReturnType<typeof clerkClient>>['invitations']['createInvitation']>
>

function toPending(inv: ClerkInvitation): PendingInvitation {
  const meta = parseInviteMetadata(inv.publicMetadata)
  const createdAt = new Date(inv.createdAt)
  return {
    id: inv.id,
    email: inv.emailAddress,
    kind: meta?.kind ?? null,
    by: meta?.by ?? null,
    createdAt,
    // Rok važi za ovaj trenutak, ne za kalendarski dan — Clerk ga meri u satima.
    expiresAt: meta ? new Date(createdAt.getTime() + expiresInDays(meta.kind) * DAY_MS) : null,
    url: inv.url ?? null,
  }
}

/** Pending pozivnice za TAČNO ovaj mejl (Clerk `query` je pretraga, ne jednakost). */
async function pendingFor(email: string): Promise<ClerkInvitation[]> {
  const client = await clerkClient()
  const { data } = await client.invitations.getInvitationList({ query: email, status: 'pending' })
  return data.filter((inv) => normalizeEmail(inv.emailAddress) === email)
}

export type IssueResult =
  | { issued: false; reason: 'cooldown' }
  | { issued: true; invitation: PendingInvitation; emailSent: boolean; emailError?: string }

/**
 * Izdaj (ili ponovo izdaj) pozivnicu i pošalji mejl.
 *
 * Postojeće pending pozivnice za isti mejl se OPOZIVAJU pre nove: Clerk bez
 * `ignoreExisting` odbija duplikat, a sa njim bi u opticaju bila dva važeća
 * linka. Jedan mejl = najviše jedan živ link.
 *
 * Admin pozivnica se NIKAD ne degradira u kupčevu: ako je admin već pozvao
 * nekoga, a ta osoba posle toga zatraži link na `/sign-up`, nov link zadržava
 * `admin` vrstu (i autora). Inače bi kupčev zahtev tiho obrisao VIP koji je admin
 * obećao.
 *
 * Baca samo na grešku Clerk API-ja; neuspeo mejl NE baca — pozivnica ostaje
 * važeća i admin je vidi u listi (link može i da se kopira ručno).
 */
export async function issueInvitation(params: {
  email: string
  kind: InviteKind
  by: string | null
  /** Admin „Pošalji ponovo" — cooldown štiti od anonimnih zahteva, ne od admina. */
  skipCooldown?: boolean
}): Promise<IssueResult> {
  const email = normalizeEmail(params.email)
  const client = await clerkClient()
  const existing = await pendingFor(email)

  const existingAdmin = existing
    .map((inv) => parseInviteMetadata(inv.publicMetadata))
    .find((meta) => meta?.kind === 'admin')

  const kind: InviteKind = params.kind === 'admin' || existingAdmin ? 'admin' : 'buyer'
  const by = params.kind === 'admin' ? params.by : (existingAdmin?.by ?? null)

  if (params.kind === 'buyer' && !params.skipCooldown) {
    const newest = existing.reduce<number | null>(
      (max, inv) => (max === null || inv.createdAt > max ? inv.createdAt : max),
      null,
    )
    if (!canReissueBuyerInvite(newest, Date.now())) {
      logInfo(EVENTS.inviteSkipped, { reason: 'cooldown', kind })
      return { issued: false, reason: 'cooldown' }
    }
  }

  // Sekvencijalno pre kreiranja: nova pozivnica ne sme da nastane dok stara još važi.
  for (const inv of existing) {
    await client.invitations.revokeInvitation(inv.id)
  }

  const created = await client.invitations.createInvitation({
    emailAddress: email,
    publicMetadata: inviteMetadata(kind, by),
    redirectUrl: `${APP_URL}/sign-up`,
    expiresInDays: expiresInDays(kind),
    notify: false,
  })
  const invitation = toPending(created)

  logInfo(EVENTS.inviteIssued, { kind, invitationId: created.id, by: by ?? undefined })

  if (!invitation.url) {
    // Clerk vraća `url` za `notify: false`; bez njega nema šta da se pošalje.
    logError(EVENTS.inviteFailed, new Error('missing_invitation_url'), { invitationId: created.id })
    return { issued: true, invitation, emailSent: false, emailError: 'Clerk nije vratio link.' }
  }

  const sent = await sendInvitationEmail({
    to: email,
    url: invitation.url,
    kind,
    expiresInDays: expiresInDays(kind),
  })

  return { issued: true, invitation, emailSent: sent.ok, emailError: sent.error }
}

/** Sve pending pozivnice, najnovije prve (za admin listu). */
export async function listPendingInvitations(limit = 100): Promise<PendingInvitation[]> {
  const client = await clerkClient()
  const { data } = await client.invitations.getInvitationList({
    status: 'pending',
    orderBy: '-created_at',
    limit,
  })
  return data.map(toPending)
}

/** Pending pozivnica po id-u, ili `null` ako više nije pending. */
export async function getPendingInvitation(id: string): Promise<PendingInvitation | null> {
  const client = await clerkClient()
  const { data } = await client.invitations.getInvitationList({ query: id, status: 'pending' })
  const inv = data.find((i) => i.id === id)
  return inv ? toPending(inv) : null
}

export async function revokeInvitation(id: string): Promise<void> {
  const client = await clerkClient()
  await client.invitations.revokeInvitation(id)
  logInfo(EVENTS.inviteRevoked, { invitationId: id })
}
