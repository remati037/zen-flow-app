import { NextResponse, type NextRequest } from 'next/server'

import { maintainAccessStatuses } from '@/lib/access/status'
import { requireCronAuth } from '@/lib/cron/auth'

export const runtime = 'nodejs'

/**
 * Vercel Cron — dnevno održavanje access_status-a.
 * Gasi istekle VIP-ove (vip → inactive bez porudžbine u prozoru, izuzev admina)
 * i vraća VIP one koji ipak imaju skorašnju porudžbinu (zaštita od propuštenog webhook-a).
 * Zaštićen `CRON_SECRET`-om. Vidi vercel.json za raspored.
 */
export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req)
  if (unauthorized) return unauthorized

  const result = await maintainAccessStatuses()
  return NextResponse.json(result)
}
