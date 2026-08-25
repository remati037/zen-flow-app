import { sql } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'

import { db, pushSubscriptions } from '@/lib/db'
import { rotatePushSubscriptionSchema } from '@/lib/validations/push'

export const runtime = 'nodejs'

/**
 * Rotacija Web Push endpoint-a — jedina ruta koju zove SERVICE WORKER.
 *
 * ── Zašto postoji ───────────────────────────────────────────────────────────
 * Push servis sme u svakom trenutku da poništi endpoint i izda nov (Chrome to
 * radi posle dužeg nekorišćenja, promene profila ili restore-a uređaja). Browser
 * o tome javlja SAMO kroz `pushsubscriptionchange` u service worker-u. Bez tog
 * handlera korisnik trajno i TIHO gubi push: stara pretplata ostaje u bazi i na
 * svako slanje vraća 410, a nova nikad ne stigne do servera. Nema greške u UI-u,
 * nema traga — podsetnici prosto prestanu.
 *
 * ── Zašto je JAVNA (PUBLIC_ROUTES) i čime je onda zaštićena ─────────────────
 * `pushsubscriptionchange` se okida u SW kontekstu, često bez ijednog otvorenog
 * prozora i satima posle poslednje interakcije. Clerk `__session` je kratkoživeći
 * JWT koji osvežava klijent — kad nema klijenta, nema ni svežeg tokena, pa bi
 * `auth.protect()` rutu presreo i (za ne-HTML zahteve) vratio **404**. Rotacija
 * bi otkazivala baš u trenutku kad je najpotrebnija.
 *
 * Zato je autentikacija POSEDOVANJE STAROG ENDPOINT-A. To nije slabija zamena za
 * sesiju nego ista vrsta tajne kao i sama pretplata: endpoint je capability URL —
 * ko ga ima, ionako može da pošalje push na taj uređaj. Server iz njega izvlači
 * `user_id` postojećeg reda; korisnika NIKAD ne uzima iz tela zahteva. Posledice:
 *
 *  - Nepoznat `oldEndpoint` → ne radi se ništa (`rotated: false`). Nema kreiranja
 *    pretplate „iz vazduha", pa ruta ne može da posluži za ubacivanje endpoint-a
 *    pod tuđi nalog.
 *  - Novi endpoint koji već pripada DRUGOM korisniku → odbija se istim uslovom
 *    kao u `savePushSubscription` (`where ... = excluded.user_id`); tuđi red se
 *    ne dira.
 *  - Endpoint-i su neprobojno dugački tokeni push servisa, pa nema enumeracije;
 *    CSRF je bespredmetan jer se ne koristi nijedan ambijentalni kredencijal.
 *
 * GET vraća javni VAPID ključ. SW nema pristup `process.env` iz aplikacije na
 * pouzdan način kroz sve build modove, a `event.oldSubscription` u nekim
 * browserima dolazi prazan — bez izvora ključa SW ne može da napravi novu
 * pretplatu. Ključ je po definiciji javan (već je u klijentskom bundle-u).
 */

/** Novi i stari endpoint se poklapaju → nema šta da se rotira, samo osveži red. */
type RotateResult = {
  rotated: boolean
  /** Koliko starih redova je uklonjeno (0 ili 1). */
  removed: number
  reason: 'rotated' | 'unknown_endpoint' | 'endpoint_taken'
}

export async function GET() {
  return NextResponse.json({
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Neispravan JSON.' }, { status: 400 })
  }

  const parsed = rotatePushSubscriptionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Neispravni podaci.' }, { status: 400 })
  }

  const { oldEndpoint, subscription } = parsed.data

  /**
   * Sve u JEDNOJ izjavi — neon-http nema `db.transaction()`, a „upiši novu, pa
   * obriši staru" u dva koraka može da stane između: prekid posle prvog koraka
   * ostavlja dve pretplate za isti uređaj (dupli push), a posle drugog nijednu.
   *
   * `owner` je JEDINI izvor `user_id` — nikad telo zahteva.
   * `moved` nosi isti uslov vlasništva kao `savePushSubscription`.
   * `removed` briše stari red tek kad je `moved` stvarno prošao (`exists`), i
   * nikad kad su stari i novi endpoint isti — CTE-ovi vide isti snapshot, pa bi
   * u tom slučaju delete obrisao red koji je upsert upravo osvežio.
   *
   * `::text` uz poređenje dva endpoint-a NIJE ukras: drizzle svaku interpolaciju
   * šalje kao zaseban NETIPIZIRAN parametar, pa `$3 <> $4` Postgres odbija sa
   * "could not determine data type of parameter". Uz kolonu se tip izvodi iz nje;
   * u poređenju dva parametra nema odakle.
   */
  const res = await db.execute<{ moved: number; removed: number }>(sql`
    with owner as (
      select "user_id" from ${pushSubscriptions} where "endpoint" = ${oldEndpoint}
    ),
    moved as (
      insert into ${pushSubscriptions} ("user_id", "endpoint", "p256dh", "auth", "last_seen_at")
      select "user_id", ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth}, now()
      from owner
      on conflict ("endpoint") do update set
        "p256dh" = excluded."p256dh",
        "auth" = excluded."auth",
        "last_seen_at" = now()
      where ${pushSubscriptions}."user_id" = excluded."user_id"
      returning "id"
    ),
    removed as (
      delete from ${pushSubscriptions}
      where "endpoint" = ${oldEndpoint}
        and ${oldEndpoint}::text <> ${subscription.endpoint}::text
        and exists (select 1 from moved)
      returning "id"
    )
    select
      (select count(*) from moved)::int as moved,
      (select count(*) from removed)::int as removed
  `)

  const row = res.rows[0]
  const moved = Number(row?.moved ?? 0)
  const removed = Number(row?.removed ?? 0)

  const result: RotateResult = moved > 0
    ? { rotated: true, removed, reason: 'rotated' }
    : { rotated: false, removed: 0, reason: 'unknown_endpoint' }

  if (moved === 0) {
    // Razlikujemo „stari endpoint nije naš" od „novi je tuđi" — prvi je normalan
    // (npr. pretplata je već rotirana ranije), drugi je stvarni konflikt i mora
    // da se vidi u logu, inače izgleda kao da rotacija tiho ne radi.
    const owned = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from ${pushSubscriptions} where "endpoint" = ${oldEndpoint}
    `)
    if (Number(owned.rows[0]?.n ?? 0) > 0) {
      result.reason = 'endpoint_taken'
      console.warn('[push] rotacija odbijena: novi endpoint pripada drugom nalogu')
    }
  }

  // Uvek 200: SW nema kome da prijavi grešku, a 4xx bi ga naterao da beskonačno
  // pokušava ponovo. Telo nosi ishod za dijagnostiku.
  return NextResponse.json(result)
}
