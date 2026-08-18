/* QA harness — čiste funkcije lib/dates.ts + lib/protocol/streak.ts pod fiksiranim satom. */

const RealDate = Date

/** Zamrzne "sada" na dati UTC instant za sve pozive `new Date()` / `Date.now()`. */
function freeze(isoUtc: string) {
  const fixed = new RealDate(isoUtc).getTime()
  class FakeDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date> | []) {
      if (args.length === 0) super(fixed)
      else super(...(args as ConstructorParameters<typeof Date>))
    }
    static now() { return fixed }
  }
  // @ts-expect-error global override
  globalThis.Date = FakeDate
}
function unfreeze() { globalThis.Date = RealDate }

let pass = 0, fail = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { pass++; console.log(`  ✅ ${label} → ${a}`) }
  else { fail++; console.log(`  ❌ ${label} → ${a}  (očekivano ${e})`) }
}

const {
  belgradeToday, belgradeTimeHM, belgradeDayStart, addDaysIso, daysBetweenIso, toBelgradeIso, hmToMinutes,
} = await import('../lib/dates')
const { computeStreak, mergeCoveredRanges, isCovered } = await import('../lib/protocol/streak')
const { estimateRunoutDate } = await import('../lib/protocol/dosing')

console.log('\n=== 1. Ponoć: 23:50 i 00:10 po Beogradu (zima, UTC+1) ===')
freeze('2026-01-15T22:50:00Z') // Beograd 23:50, 15. jan
check('23:50 zima → belgradeToday', belgradeToday(), '2026-01-15')
check('23:50 zima → belgradeTimeHM', belgradeTimeHM(), '23:50')
check('23:50 zima → dayStart (UTC)', belgradeDayStart().toISOString(), '2026-01-14T23:00:00.000Z')
unfreeze()

freeze('2026-01-15T23:10:00Z') // Beograd 00:10, 16. jan
check('00:10 zima → belgradeToday', belgradeToday(), '2026-01-16')
check('00:10 zima → belgradeTimeHM', belgradeTimeHM(), '00:10')
check('00:10 zima → dayStart (UTC)', belgradeDayStart().toISOString(), '2026-01-15T23:00:00.000Z')
unfreeze()

console.log('\n=== 2. Ponoć: 23:50 i 00:10 po Beogradu (leto, UTC+2) ===')
freeze('2026-07-15T21:50:00Z') // Beograd 23:50, 15. jul
check('23:50 leto → belgradeToday', belgradeToday(), '2026-07-15')
check('23:50 leto → belgradeTimeHM', belgradeTimeHM(), '23:50')
check('23:50 leto → dayStart (UTC)', belgradeDayStart().toISOString(), '2026-07-14T22:00:00.000Z')
unfreeze()

freeze('2026-07-15T22:10:00Z') // Beograd 00:10, 16. jul
check('00:10 leto → belgradeToday', belgradeToday(), '2026-07-16')
check('00:10 leto → belgradeTimeHM', belgradeTimeHM(), '00:10')
check('00:10 leto → dayStart (UTC)', belgradeDayStart().toISOString(), '2026-07-15T22:00:00.000Z')
unfreeze()

console.log('\n=== 3. Dedup granica: 23:50 vs 00:10 moraju biti RAZLIČITI dani ===')
freeze('2026-01-15T22:50:00Z'); const dayA = belgradeDayStart().toISOString(); const todayA = belgradeToday(); unfreeze()
freeze('2026-01-15T23:10:00Z'); const dayB = belgradeDayStart().toISOString(); const todayB = belgradeToday(); unfreeze()
check('dayStart se pomerio preko ponoći', dayA !== dayB, true)
check('belgradeToday se pomerio preko ponoći', todayA !== todayB, true)
check('razmak dayStart-ova = tačno 24h', (new RealDate(dayB).getTime() - new RealDate(dayA).getTime()) / 3600000, 24)

console.log('\n=== 4. DST prelazi (EU: 29.03.2026 napred, 25.10.2026 nazad) ===')
// Proleće: 02:00 CET → 03:00 CEST. Beogradski dan 29.03. ima 23 sata.
freeze('2026-03-29T01:30:00Z') // Beograd 03:30 CEST (tranzicija je u 01:00 UTC)
check('proleće, posle skoka → today', belgradeToday(), '2026-03-29')
check('proleće → belgradeTimeHM', belgradeTimeHM(), '03:30')
check('proleće → dayStart (beogradska ponoć 29.03 = 28.03 23:00Z)', belgradeDayStart().toISOString(), '2026-03-28T23:00:00.000Z')
unfreeze()
// Jesen: 03:00 CEST → 02:00 CET. Beogradski dan 25.10. ima 25 sati.
freeze('2026-10-25T02:30:00Z') // Beograd 03:30 CET (posle vraćanja)
check('jesen, posle vraćanja → today', belgradeToday(), '2026-10-25')
check('jesen → belgradeTimeHM', belgradeTimeHM(), '03:30')
check('jesen → dayStart (očekivano 24.10 22:00Z = beogradska ponoć)', belgradeDayStart().toISOString(), '2026-10-24T22:00:00.000Z')
unfreeze()

console.log('\n=== 5. Čista string aritmetika preko DST-a ===')
check('addDaysIso preko prolećnog DST', addDaysIso('2026-03-28', 1), '2026-03-29')
check('addDaysIso preko jesenjeg DST', addDaysIso('2026-10-24', 2), '2026-10-26')
check('addDaysIso preko prestupnog dana', addDaysIso('2028-02-28', 1), '2028-02-29')
check('addDaysIso unazad preko godine', addDaysIso('2026-01-01', -1), '2025-12-31')
check('addDaysIso +60 (VIP prozor)', addDaysIso('2026-08-18', 60), '2026-10-17')
check('daysBetweenIso preko oba DST-a', daysBetweenIso('2026-03-01', '2026-11-01'), 245)
check('daysBetweenIso isti dan', daysBetweenIso('2026-08-18', '2026-08-18'), 0)
check('estimateRunoutDate 60 kaps (15 dana)', estimateRunoutDate('2026-03-25', 60), '2026-04-09')

console.log('\n=== 6. toBelgradeIso: order.orderDate oko ponoći ===')
check('porudžbina 22:50Z u zimi → beogradski 15.01', toBelgradeIso(new RealDate('2026-01-15T22:50:00Z')), '2026-01-15')
check('porudžbina 23:10Z u zimi → beogradski 16.01', toBelgradeIso(new RealDate('2026-01-15T23:10:00Z')), '2026-01-16')
check('porudžbina 22:10Z u letu → beogradski 16.07', toBelgradeIso(new RealDate('2026-07-15T22:10:00Z')), '2026-07-16')

console.log('\n=== 7. hmToMinutes (Postgres time vs HH:mm) ===')
check("'08:00'", hmToMinutes('08:00'), 480)
check("'08:00:00' (pg time)", hmToMinutes('08:00:00'), 480)
check("'23:50'", hmToMinutes('23:50'), 1430)
check("'00:10'", hmToMinutes('00:10'), 10)

console.log('\n=== 8. computeStreak: check-in u 23:50 vs 00:10 ===')
const cov = mergeCoveredRanges(['2026-01-01'])
// Scenario: kompletni 13. i 14., a 15. korisnik završava u 23:50.
const beforeMidnight = computeStreak({
  completedDates: new Set(['2026-01-13', '2026-01-14', '2026-01-15']),
  coveredRanges: cov, today: '2026-01-15', startDate: '2026-01-10',
})
check('23:50 (15.01) → streak 3, todayComplete', [beforeMidnight.current, beforeMidnight.todayComplete], [3, true])
// 00:10 sledećeg dana: današnji dan još nije kompletan → grace, streak se drži.
const afterMidnight = computeStreak({
  completedDates: new Set(['2026-01-13', '2026-01-14', '2026-01-15']),
  coveredRanges: cov, today: '2026-01-16', startDate: '2026-01-10',
})
check('00:10 (16.01) → streak i dalje 3 (grace), todayComplete false', [afterMidnight.current, afterMidnight.todayComplete], [3, false])
// Ako je propušten juče (pokriven, nekompletan) → prekid.
const missedYesterday = computeStreak({
  completedDates: new Set(['2026-01-13', '2026-01-14']),
  coveredRanges: cov, today: '2026-01-16', startDate: '2026-01-10',
})
check('propušten 15.01 → streak reset na 0', missedYesterday.current, 0)

console.log('\n=== 9. computeStreak: pauza dok je korisnik inactive ===')
// Porudžbina 01.01 (pokriva do 02.03), pa rupa, pa nova porudžbina 01.06.
const gapCov = mergeCoveredRanges(['2026-01-01', '2026-06-01'])
check('dve porudžbine → dva odvojena intervala', gapCov.length, 2)
check('rupa 01.04 nije pokrivena', isCovered('2026-04-01', gapCov), false)
// Kompletni su SVI pokriveni dani pre rupe (do 02.03 = kraj intervala) i SVI posle nove
// porudžbine (od 01.06). Samo tada pauza sme da spoji niz: 3 + 3 = 6.
const frozen = computeStreak({
  completedDates: new Set(['2026-02-28', '2026-03-01', '2026-03-02', '2026-06-01', '2026-06-02', '2026-06-03']),
  coveredRanges: gapCov, today: '2026-06-03', startDate: '2026-02-28',
})
check('niz preživeo inactive rupu (3 pre + 3 posle = 6)', frozen.current, 6)
check('longest = 6', frozen.longest, 6)

// KONTRA-SLUČAJ (dokumentuje realno ponašanje): ako je propušten makar JEDAN pokriven
// dan — poslednji pre rupe ili prvi posle nove porudžbine — pauza ne pomaže, niz puca.
const brokenAtEdge = computeStreak({
  completedDates: new Set(['2026-02-28', '2026-03-01', '2026-03-02', '2026-06-02', '2026-06-03']),
  coveredRanges: gapCov, today: '2026-06-03', startDate: '2026-02-28',
})
check('propušten dan nove porudžbine (01.06) → niz pukao, ostaje 2', brokenAtEdge.current, 2)

console.log('\n=== 10. computeStreak: rubni slučajevi ===')
check('bez startDate → prazno', computeStreak({ completedDates: new Set(), coveredRanges: [], today: '2026-08-18', startDate: null }), { current: 0, longest: 0, todayComplete: false })
const adminCov = computeStreak({ completedDates: new Set(['2026-08-17', '2026-08-18']), coveredRanges: [], alwaysCovered: true, today: '2026-08-18', startDate: '2026-08-01' })
check('admin (alwaysCovered) bez porudžbina → prekid na 16.08, pa 2', adminCov.current, 2)
const merged = mergeCoveredRanges(['2026-01-01', '2026-02-01'])
check('preklapajuće porudžbine → jedan merge-ovan interval', merged, [['2026-01-01', '2026-04-02']])

console.log(`\n──────────────\nRezultat: ${pass} prošlo, ${fail} palo\n`)
process.exit(fail > 0 ? 1 : 0)
