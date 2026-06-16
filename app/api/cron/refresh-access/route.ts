import { NextResponse, type NextRequest } from 'next/server'

import { maintainAccessStatuses } from '@/lib/access/status'

export const runtime = 'nodejs'

/**
 * Vercel Cron — dnevno održavanje access_status-a.
 * Gasi istekle VIP-ove (vip → inactive bez porudžbine u prozoru, izuzev admina)
 * i vraća VIP one koji ipak imaju skorašnju porudžbinu (zaštita od propuštenog webhook-a).
 * Zaštićen `CRON_SECRET`-om. Vidi vercel.json za raspored.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const result = await maintainAccessStatuses()
  return NextResponse.json(result)
}
