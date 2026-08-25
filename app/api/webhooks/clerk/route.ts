import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { clerkClient } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { refreshAccessStatusForEmail } from '@/lib/access/status'
import { belgradeToday } from '@/lib/dates'
import { db, profiles } from '@/lib/db'
import { sendWelcomeEmail } from '@/lib/email/send'
import { hasEverNotified } from '@/lib/push/dedup'
import { EVENTS, logError } from '@/lib/observability/log'

export const runtime = 'nodejs'

/**
 * Clerk webhook — sinhronizuje Clerk korisnike sa `profiles` tabelom.
 * Potpis se verifikuje preko CLERK_WEBHOOK_SIGNING_SECRET (svix).
 * Ruta je javna (vidi middleware `isPublicRoute`).
 */
export async function POST(req: NextRequest) {
  let evt
  try {
    evt = await verifyWebhook(req)
  } catch (err) {
    logError(EVENTS.webhookFailed, err, { source: 'clerk', stage: 'signature' })
    return new NextResponse('Invalid signature', { status: 400 })
  }

  const eventType = evt.type

  if (eventType === 'user.created' || eventType === 'user.updated') {
    const { id, email_addresses, primary_email_address_id, first_name, last_name, public_metadata } =
      evt.data

    const primaryEmail =
      email_addresses.find((e) => e.id === primary_email_address_id)?.email_address ??
      email_addresses[0]?.email_address

    if (!primaryEmail) {
      logError(EVENTS.webhookFailed, new Error('missing_email'), { source: 'clerk', userId: id })
      return new NextResponse('No email', { status: 400 })
    }

    const name = [first_name, last_name].filter(Boolean).join(' ') || null

    if (eventType === 'user.created') {
      await db
        .insert(profiles)
        .values({
          id,
          email: primaryEmail,
          name,
          role: 'user',
          accessStatus: 'inactive',
        })
        .onConflictDoNothing({ target: profiles.id })

      // Postavi default rolu u publicMetadata da middleware claim radi od starta.
      if (!(public_metadata as Record<string, unknown>)?.role) {
        const client = await clerkClient()
        await client.users.updateUserMetadata(id, {
          publicMetadata: { role: 'user' },
        })
      }

      /**
       * Korak 1.3 — verifikacija porudžbine pri registraciji: `refreshAccessStatusForEmail`
       * diže profil na `vip` ako u `orders` postoji porudžbina u 60-dnevnom prozoru.
       *
       * ZAŠTO OVO VIŠE NE ZAVISI OD `returning()` (S-L2): ranije je ceo blok stajao iza
       * `if (inserted.length > 0)`. `onConflictDoNothing` na konfliktu vraća PRAZAN
       * `returning()`, a Clerk webhook retry-uje `user.created` na svaki neuspeh
       * isporuke (timeout, 500, deploy u trenutku poziva). Prvi pokušaj bi upisao
       * profil pa pao na sledećem koraku, a svaki naredni bi tiho preskočio i
       * verifikaciju pristupa i welcome mejl — korisnik ostaje `inactive` i bez
       * ijedne poruke, a webhook vraća 200. Sada obe putanje rade isti posao;
       * `refreshAccessStatusForEmail` je po prirodi idempotentan.
       */
      const refreshed = await refreshAccessStatusForEmail(primaryEmail)

      // Welcome mejl ide SAMO VIP kupcima (verifikacija je našla porudžbinu).
      if (refreshed?.status === 'vip') {
        /**
         * Idempotencija u DVA sloja, jer retry i trka nisu isti problem:
         *  - `hasEverNotified` pokriva ponovljen retry (sat/dan kasnije) — welcome
         *    ide jednom u životu naloga, a ne jednom dnevno. Gleda samo `success`,
         *    pa neuspeo mejl sme ponovo.
         *  - `dedup` rezervacija pokriva DVA ISTOVREMENA retry-ja: oba prođu proveru
         *    iznad pre nego što bilo koji upiše red, pa duplikat zaustavlja tek
         *    jedinstveni indeks u `notifications_log`.
         * `sendWelcomeEmail` ne baca; neuspeh samo završi u `notifications_log`.
         */
        if (!(await hasEverNotified(id, 'welcome', 'email'))) {
          await sendWelcomeEmail(
            { id, email: primaryEmail, name },
            { dedup: { day: belgradeToday() } },
          )
        }
      }
    } else {
      // user.updated — osveži email/name i sinhronizuj rolu iz Clerk publicMetadata
      // (Clerk je izvor istine za rolu; menja se ručno u Dashboard-u → ovde stiže u DB).
      const metadataRole = (public_metadata as Record<string, unknown>)?.role
      const role = metadataRole === 'admin' ? 'admin' : metadataRole === 'user' ? 'user' : undefined

      await db
        .update(profiles)
        .set({ email: primaryEmail, name, ...(role ? { role } : {}) })
        .where(eq(profiles.id, id))

      // Promena mejla može da se poklopi sa porudžbinom → re-evaluiraj pristup.
      await refreshAccessStatusForEmail(primaryEmail)
    }
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data
    if (id) {
      await db.delete(profiles).where(eq(profiles.id, id))
    }
  }

  return NextResponse.json({ received: true })
}
