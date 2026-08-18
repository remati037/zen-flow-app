'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { VIP_WINDOW_DAYS, getLatestOrderDate } from '@/lib/access/status'
import { createAction } from '@/lib/actions/safe-action'
import { db, profiles } from '@/lib/db'
import { sendWelcomeEmail } from '@/lib/email/send'
import { adminUserIdSchema, setAccessStatusSchema } from '@/lib/validations/admin'

const DAY_MS = 24 * 60 * 60 * 1000

function revalidateAdmin() {
  revalidatePath('/admin/korisnici')
  revalidatePath('/admin')
}

export type SetAccessStatusResult =
  | { applied: false; reason: 'not-found' }
  | {
      applied: true
      email: string
      status: 'vip' | 'inactive'
      /**
       * `true` kad je ručno postavljen `vip` bez porudžbine u prozoru — noćni
       * cron (`maintainAccessStatuses`) će ga vratiti na `inactive`.
       * MVP: dokumentovano ponašanje, bez izmene šeme (nema "manual override" kolone).
       */
      willRevertOnCron: boolean
    }

/**
 * Ručni override access statusa. Piše direktno u `profiles.access_status` —
 * isti izvor istine koji čitaju gejt (`(app)/layout.tsx`) i cron.
 */
export const setUserAccessStatus = createAction(
  setAccessStatusSchema,
  async ({ userId, status }): Promise<SetAccessStatusResult> => {
    const [target] = await db
      .select({ id: profiles.id, email: profiles.email, role: profiles.role })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1)

    if (!target) return { applied: false, reason: 'not-found' }

    await db.update(profiles).set({ accessStatus: status }).where(eq(profiles.id, userId))
    revalidateAdmin()

    // Admin je izuzet iz cron gašenja (resolveAccessStatus ga uvek vraća na vip).
    let willRevertOnCron = false
    if (status === 'vip' && target.role !== 'admin') {
      const latestOrderDate = await getLatestOrderDate(target.email)
      willRevertOnCron =
        !latestOrderDate || Date.now() - latestOrderDate.getTime() > VIP_WINDOW_DAYS * DAY_MS
    }

    return { applied: true, email: target.email, status, willRevertOnCron }
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
