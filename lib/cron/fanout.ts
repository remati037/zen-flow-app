/**
 * Paralelno slanje u kontrolisanim grupama — deljeno između cron ruta.
 *
 * Čist modul (bez `server-only`) da ga i QA može importovati.
 */

/**
 * Koliko korisnika se obrađuje istovremeno.
 *
 * Zašto 12, a ne 1 (sekvencijalno) i ne „svi odjednom":
 *
 *  - **Sekvencijalno je bilo opasno.** Jedan korisnik = 1 `select` pretplata +
 *    N HTTPS POST-ova ka push servisu + 1 `insert` u log ≈ 200–400 ms. Na 300
 *    korisnika to je 1–2 min, a Vercel funkcija se seče na `maxDuration`. Batch
 *    bi se tiho prekidao u sredini — korisnici na kraju liste nikad ne bi dobili
 *    podsetnik, i to bez ijedne greške u logu.
 *  - **Bez ograničenja bi puklo drugačije.** neon-http otvara zaseban HTTP
 *    zahtev po upitu, pa 300 paralelnih korisnika znači ~900 istovremenih
 *    odlaznih zahteva — Neon ih rate-limituje, a FCM/APNs na burst vraćaju 429.
 *    Oba otkaza izgledaju kao „push ne radi", a zapravo su self-inflicted.
 *  - **12 je sredina koja staje u budžet.** ~12 × 3 = ~36 zahteva u letu je
 *    daleko ispod limita oba servisa, a 300 korisnika prođe u ~25 grupa ≈ 8 s —
 *    unutar `maxDuration` sa velikom rezervom.
 *
 * Ako baza korisnika naraste preko ~2000, ovo više nije dovoljno i posao treba
 * podeliti na više run-ova (cursor po `id`), ne dizati chunk u nebo.
 */
export const FANOUT_CHUNK = 12

/**
 * Pusti `run` nad svim stavkama, po `chunkSize` istovremeno.
 *
 * `Promise.allSettled` je ovde suština, ne detalj: jedan `throw` (npr. pad
 * `getProtocolState` za jednog korisnika) NE sme da obori ceo batch. Ranije je
 * petlja bila `for ... await` bez `try/catch`, pa je jedan pokvaren profil
 * ostavljao sve ostale bez podsetnika za taj dan.
 */
export async function runChunked<T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>,
  chunkSize: number = FANOUT_CHUNK,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    out.push(...(await Promise.allSettled(chunk.map(run))))
  }
  return out
}
