import { verifyWebhook } from '@clerk/nextjs/webhooks'
import { clerkClient } from '@clerk/nextjs/server'
import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { refreshAccessStatusForEmail } from '@/lib/access/status'
import { db, profiles } from '@/lib/db'
import { sendWelcomeEmail } from '@/lib/email/send'

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
    console.error('[clerk-webhook] verifikacija potpisa neuspešna:', err)
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
      console.error('[clerk-webhook] korisnik bez email adrese:', id)
      return new NextResponse('No email', { status: 400 })
    }

    const name = [first_name, last_name].filter(Boolean).join(' ') || null

    if (eventType === 'user.created') {
      const inserted = await db
        .insert(profiles)
        .values({
          id,
          email: primaryEmail,
          name,
          role: 'user',
          accessStatus: 'inactive',
        })
        .onConflictDoNothing({ target: profiles.id })
        .returning({ id: profiles.id })

      // Postavi default rolu u publicMetadata da middleware claim radi od starta.
      if (!(public_metadata as Record<string, unknown>)?.role) {
        const client = await clerkClient()
        await client.users.updateUserMetadata(id, {
          publicMetadata: { role: 'user' },
        })
      }

      // Korak 1.3 — verifikacija porudžbine pri registraciji. Profil je upravo kreiran,
      // pa ga refreshAccessStatusForEmail nalazi i diže na `vip` ako u `orders` postoji
      // porudžbina u 60-dnevnom prozoru. Radi samo kad je novi red stvarno ubačen.
      if (inserted.length > 0) {
        const refreshed = await refreshAccessStatusForEmail(primaryEmail)

        // Welcome mejl ide SAMO VIP kupcima (verifikacija je našla porudžbinu).
        // sendWelcomeEmail ne baca; mejl fail samo loguje u notifications_log.
        if (refreshed?.status === 'vip') {
          await sendWelcomeEmail({ id, email: primaryEmail, name })
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
