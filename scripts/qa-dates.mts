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
const { estimateRunoutDate, CAPSULES_PER_DAY, CAPSULES_PER_DOSE } = await import('../lib/protocol/dosing')
const { ACCESS_WINDOW_DAYS, accessWindowCutoff, accessWindowEnd, isWithinAccessWindow } = await import('../lib/access/window')
const { inWindow, reminderWindowStart, streakRiskWindowStart, minutesToHm, WINDOW_MIN } = await import('../lib/push/dispatch-rules')
const {
  CRON_JOBS, DISPATCHER_STALE_HOURS, describeDispatcherHealth, isGapMissed, minutesBetween, formatMinutes,
} = await import('../lib/cron/health')
const {
  classifyOrderStatus, isAccessGrantingStatus, parseWooGmtDate, resolveOrderDate, wasInserted,
} = await import('../lib/woocommerce/order-rules')
const { asOverride, resolveAccessStatus } = await import('../lib/access/resolve')
const { LOW_STOCK_THRESHOLD, LOW_STOCK_MAX_ALERTS_PER_EPISODE } = await import('../lib/protocol/dosing')

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

console.log('\n=== 11. Dispatcher: prozori podsetnika ===')
// Scheduler gađa rutu na 15 min. Svako moguće vreme doze mora da padne u bar
// jedan tick, inače podsetnik ne stigne nikad.
/** Koliko vremena doze ostane bez ijednog tick-a pri datoj kadenci schedulera. */
function uncoveredAt(cadenceMin: number, windowMin: number = WINDOW_MIN): number {
  const ticks = Array.from({ length: Math.floor(1440 / cadenceMin) }, (_, i) => i * cadenceMin)
  return uncoveredForTicks(ticks, windowMin)
}

/** Ista provera nad PROIZVOLJNIM rasporedom tick-ova (za simulaciju jitter-a). */
function uncoveredForTicks(ticks: number[], windowMin: number = WINDOW_MIN): number {
  let miss = 0
  for (let dose = 0; dose < 1440; dose++) {
    if (!ticks.some((t) => inWindow(t, reminderWindowStart(dose, windowMin), windowMin))) miss++
  }
  return miss
}

check(`trenutni prozor (NOTIFICATION_WINDOW_MIN, default)`, WINDOW_MIN, 45)
check('svako od 1440 vremena doze uhvati bar jedan tick (kadenca 15)', uncoveredAt(15), 0)

// PRAVILO UPARIVANJA: pokrivenost je potpuna dok je kadenca ≤ prozor.
// Ovo je jedina stvar koju treba proveriti pri promeni kadence schedulera.
check('kadenca 1 ≤ prozor 45 → potpuna pokrivenost', uncoveredAt(1), 0)
check('kadenca 5 ≤ prozor 45 → potpuna pokrivenost', uncoveredAt(5), 0)
check('kadenca 45 = prozor 45 → potpuna pokrivenost', uncoveredAt(45), 0)
// Kadenca šira od prozora ostavlja rupe — zato ih docs uparuju.
check('kadenca 60 > prozor 45 → ima rupa (zato pravilo postoji)', uncoveredAt(60) > 0, true)
// Stari prozor (30) i dalje mora da bude ispravan za one koji ga eksplicitno postave.
check('kadenca 30 = prozor 30 → potpuna pokrivenost', uncoveredAt(30, 30), 0)
check('kadenca 45 > prozor 30 → ima rupa', uncoveredAt(45, 30) > 0, true)

// Clamp-ovi se pomeraju sa prozorom: pri 45 najkasniji start je 23:15.
check('doza 23:50 → prozor stane u dan', minutesToHm(reminderWindowStart(hmToMinutes('23:50'))), '23:15')
check('doza 08:00 → prozor netaknut', minutesToHm(reminderWindowStart(hmToMinutes('08:00'))), '08:00')
check('doza 23:15 → poslednji netaknut prozor', minutesToHm(reminderWindowStart(hmToMinutes('23:15'))), '23:15')
// Kompromis clamp-a: doza posle 23:15 dobija podsetnik ranije nego što je podešeno,
// ali GA DOBIJA — bez clamp-a prozor za tako kasnu dozu nije dostižan nijednom ticku.
check('doza 23:45 → clamp na 23:15 (30 min ranije, ali stiže)', minutesToHm(reminderWindowStart(hmToMinutes('23:45'))), '23:15')
check('prozor 30 → isti clamp daje 23:30 (parametar radi)', minutesToHm(reminderWindowStart(hmToMinutes('23:45'), 30)), '23:30')

// Streak-at-risk: isti clamp; kasna večernja doza ne sme da isklizne iz dana.
check('veče 20:00 → risk prozor 21:30', minutesToHm(streakRiskWindowStart(hmToMinutes('20:00'))), '21:30')
check('veče 18:00 → risk prozor 21:00 (pod nikad-pre-21h)', minutesToHm(streakRiskWindowStart(hmToMinutes('18:00'))), '21:00')
check('veče 23:00 → risk prozor clamp-ovan na 23:15', minutesToHm(streakRiskWindowStart(hmToMinutes('23:00'))), '23:15')
check('bez večernje doze → risk prozor 21:00', minutesToHm(streakRiskWindowStart(null)), '21:00')
const riskTicks = Array.from({ length: 96 }, (_, i) => i * 15)
const riskUncovered: number[] = []
for (let ev = 0; ev < 1440; ev++) {
  if (!riskTicks.some((t) => inWindow(t, streakRiskWindowStart(ev)))) riskUncovered.push(ev)
}
check('svako večernje vreme daje dostižan risk prozor', riskUncovered.length, 0)

console.log('\n=== 11b. Jitter i rupe u rasporedu (zašto je prozor 45, a ne 30) ===')
// GitHub Actions ne poštuje `schedule`: kasni 10–20 min, a pod opterećenjem
// preskoči run. Ovde se raspored simulira DETERMINISTIČKI, pa test ne treperi.

/**
 * Nominalni raspored na `cadence`, ali: svaki `skipEvery`-ti run se preskoči, a
 * PRVI run posle preskoka kasni `delay` — najgori realan scenario GitHub Actions-a.
 * Razmak koji tako nastane je `2 × cadence + delay`.
 */
function jitteredTicks({ cadence, delay, skipEvery }: { cadence: number; delay: number; skipEvery: number }): number[] {
  const out: number[] = []
  for (let i = 0; i * cadence < 1440; i++) {
    const skipped = i % skipEvery === skipEvery - 1
    if (skipped) continue
    const afterSkip = i > 0 && i % skipEvery === 0
    const t = i * cadence + (afterSkip ? delay : 0)
    if (t < 1440) out.push(t)
  }
  return out
}

// Jedan preskočen run od svaka 4 + 15 min kašnjenja narednog.
// Najgori razmak koji ovako nastane je 45 min (15×2 zbog preskoka + 15 kašnjenja).
const jitter = jitteredTicks({ cadence: 15, delay: 15, skipEvery: 4 })
const worstGap = Math.max(...jitter.slice(1).map((t, i) => t - jitter[i]))
check('simulirani najgori razmak između poziva', worstGap, 45)
check('prozor 45 ≥ razmak 45 → nijedan podsetnik nije izgubljen', uncoveredForTicks(jitter, 45), 0)
check('prozor 30 < razmak 45 → podsetnici SE gube (razlog za 45)', uncoveredForTicks(jitter, 30) > 0, true)

// Klasifikacija rupe — isti prag koji dijagnostika pokazuje adminu.
check('razmak 15 pri prozoru 45 → nije rupa', isGapMissed(15, 45), false)
check('razmak 45 = prozor → još uvek nije rupa (granica je uključena)', isGapMissed(45, 45), false)
check('razmak 46 > prozor → rupa', isGapMissed(46, 45), true)
check('prvi run ikad (null) → nije rupa', isGapMissed(null, 45), false)
check('razmak 45 pri prozoru 30 → rupa', isGapMissed(45, 30), true)

console.log('\n=== 11c. Alert kad dispatcher nije pozvan ===')
const NOW = new Date('2026-08-25T12:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)
const run = (over: Partial<Parameters<typeof describeDispatcherHealth>[0]['run'] & object> = {}) => ({
  lastRunAt: minutesAgo(10), lastGapMin: 15, maxGapMin: 15, maxGapAt: minutesAgo(600), runsTotal: 500, ...over,
})
const health = (r: ReturnType<typeof run> | null) =>
  describeDispatcherHealth({ run: r, now: NOW, windowMin: 45 }).status

check('ključ posla je stabilan', CRON_JOBS.notifications, 'notifications')
check('prag mrtvog dispatchera (h)', DISPATCHER_STALE_HOURS, 2)
check('nikad pozvan → never', health(null), 'never')
check('poslednji run pre 10 min, bez rupa → ok', health(run()), 'ok')
check('poslednji run pre 119 min → još uvek ok (ispod praga)', health(run({ lastRunAt: minutesAgo(119) })), 'ok')
check('poslednji run pre 120 min → stale (prag je 2h)', health(run({ lastRunAt: minutesAgo(120) })), 'stale')
check('poslednji run pre 8h → stale', health(run({ lastRunAt: minutesAgo(480) })), 'stale')
check('živ, ali je jednom ćutao 90 min → gaps', health(run({ maxGapMin: 90 })), 'gaps')
check('stale ima prioritet nad gaps', health(run({ lastRunAt: minutesAgo(300), maxGapMin: 90 })), 'stale')
// Poruka mora da imenuje scheduler — admin je čita na telefonu, bez pristupa logovima.
check(
  'poruka za never pominje scheduler',
  describeDispatcherHealth({ run: null, now: NOW, windowMin: 45 }).message.includes('scheduler'),
  true,
)
check('minutesBetween zaokružuje na minut', minutesBetween(minutesAgo(90), NOW), 90)
check('sat unazad ne daje negativan razmak', minutesBetween(new Date(NOW.getTime() + 60_000), NOW), 0)
check('formatMinutes: 45', formatMinutes(45), '45 min')
check('formatMinutes: 120', formatMinutes(120), '2h')
check('formatMinutes: 95', formatMinutes(95), '1h 35min')

console.log('\n=== 12. WooCommerce: datum porudžbine iz GMT polja ===')
// Woo šalje `*_gmt` BEZ oznake zone. Bez eksplicitnog 'Z' to se parsira kao lokalno
// vreme procesa → večernja porudžbina isklizne u pogrešan beogradski dan.
check(
  'leto: gmt 21:30Z = Beograd 23:30, 24.08 → dan 24.08',
  toBelgradeIso(resolveOrderDate({ date_paid_gmt: '2026-08-24T21:30:00' })),
  '2026-08-24',
)
check(
  'leto: gmt 22:30Z = Beograd 00:30, 25.08 → dan 25.08',
  toBelgradeIso(resolveOrderDate({ date_paid_gmt: '2026-08-24T22:30:00' })),
  '2026-08-25',
)
check(
  'zima: gmt 22:30Z = Beograd 23:30, 15.01 → dan 15.01',
  toBelgradeIso(resolveOrderDate({ date_paid_gmt: '2026-01-15T22:30:00' })),
  '2026-01-15',
)
check(
  'zima: gmt 23:30Z = Beograd 00:30, 16.01 → dan 16.01',
  toBelgradeIso(resolveOrderDate({ date_paid_gmt: '2026-01-15T23:30:00' })),
  '2026-01-16',
)
// Prioritet: plaćanje pre kreiranja, GMT pre lokalnih polja.
check(
  'date_paid_gmt ima prioritet nad date_created_gmt',
  resolveOrderDate({ date_paid_gmt: '2026-08-24T21:30:00', date_created_gmt: '2026-08-20T10:00:00' }).toISOString(),
  '2026-08-24T21:30:00.000Z',
)
check(
  'bez date_paid_gmt → date_created_gmt',
  resolveOrderDate({ date_created_gmt: '2026-08-20T10:00:00' }).toISOString(),
  '2026-08-20T10:00:00.000Z',
)
check(
  'GMT ima prioritet nad ne-GMT parnjakom',
  resolveOrderDate({ date_paid_gmt: '2026-08-24T21:30:00', date_paid: '2026-08-24T23:30:00' }).toISOString(),
  '2026-08-24T21:30:00.000Z',
)
// Rubni oblici koje Woo stvarno šalje.
check('razmak umesto T se normalizuje', parseWooGmtDate('2026-08-24 21:30:00')?.toISOString(), '2026-08-24T21:30:00.000Z')
check('postojeći Z se ne duplira', parseWooGmtDate('2026-08-24T21:30:00Z')?.toISOString(), '2026-08-24T21:30:00.000Z')
check('offset zone se poštuje', parseWooGmtDate('2026-08-24T23:30:00+02:00')?.toISOString(), '2026-08-24T21:30:00.000Z')
check("'0000-00-00 00:00:00' → null", parseWooGmtDate('0000-00-00 00:00:00'), null)
check('null → null', parseWooGmtDate(null), null)
check('prazan string → null', parseWooGmtDate('   '), null)
check('smeće → null', parseWooGmtDate('nije-datum'), null)
// Payload bez ijednog datuma pada na fallback (u kodu: "sada").
const fallback = new RealDate('2026-08-24T12:00:00Z')
check('bez datuma → fallback', resolveOrderDate({}, fallback).toISOString(), fallback.toISOString())

console.log('\n=== 13. WooCommerce: klasifikacija statusa ===')
check("'processing' → synced", classifyOrderStatus('processing'), 'synced')
check("'completed' → synced", classifyOrderStatus('completed'), 'synced')
check("'refunded' → revoked", classifyOrderStatus('refunded'), 'revoked')
check("'cancelled' → revoked", classifyOrderStatus('cancelled'), 'revoked')
check("'failed' → revoked", classifyOrderStatus('failed'), 'revoked')
check("'on-hold' → ignored (pred-plaćanje, ne opoziv)", classifyOrderStatus('on-hold'), 'ignored')
check("'pending' → ignored", classifyOrderStatus('pending'), 'ignored')
check("'Completed' (case) → synced", classifyOrderStatus('Completed'), 'synced')
check('nepoznat status → ignored', classifyOrderStatus('wc-nesto-novo'), 'ignored')
check('pristup daje samo synced', [
  isAccessGrantingStatus('processing'), isAccessGrantingStatus('refunded'), isAccessGrantingStatus('on-hold'),
], [true, false, false])

console.log('\n=== 14. WooCommerce: upsert simulacija (dupli webhook, refund) ===')
// Verna simulacija SQL semantike iz upsertOrder:
//  - `insert ... on conflict do update ... returning (xmax = 0)` je JEDNA atomična izjava;
//    `inserted` je true samo za red koji je ta izjava stvarno insertovala.
//  - opoziv je `update ... where woo_order_id = ...` — ne pravi red ako ga nema.
type FakeOrderRow = { wooOrderId: string; email: string; status: string; orderDate: Date; capsulesTotal: number }
function makeFakeOrders() {
  const rows = new Map<string, FakeOrderRow>()
  return {
    rows,
    /** `insert … on conflict do update … returning (xmax = 0)`. Vraća 't'/'f' kao neon-http. */
    upsert(row: FakeOrderRow): { inserted: unknown } {
      const isNew = !rows.has(row.wooOrderId)
      rows.set(row.wooOrderId, { ...row })
      return { inserted: isNew ? 't' : 'f' }
    },
    /** `update orders set status = … where woo_order_id = … returning email`. */
    revoke(wooOrderId: string, status: string): { email: string } | undefined {
      const row = rows.get(wooOrderId)
      if (!row) return undefined
      row.status = status
      return { email: row.email }
    },
  }
}

const fakeOrders = makeFakeOrders()
let capsulesToppedUp = 0

/** Isti tok odlučivanja kao `upsertOrder` — bez DB-a i bez zod-a. */
function handleWooEvent(payload: {
  id: string; email: string; status: string; capsulesTotal: number; date_paid_gmt?: string
}): string {
  const statusClass = classifyOrderStatus(payload.status)
  if (statusClass === 'ignored') return 'skipped'

  if (statusClass === 'revoked') {
    const revoked = fakeOrders.revoke(payload.id, payload.status.toLowerCase())
    return revoked ? 'revoked' : 'skipped'
  }

  const { inserted } = fakeOrders.upsert({
    wooOrderId: payload.id,
    email: payload.email,
    status: payload.status.toLowerCase(),
    orderDate: resolveOrderDate(payload),
    capsulesTotal: payload.capsulesTotal,
  })
  const created = wasInserted(inserted)
  if (created) capsulesToppedUp += payload.capsulesTotal
  return created ? 'created' : 'updated'
}

/** Poslednja porudžbina koja DAJE pristup (isti filter kao getLatestOrderDate). */
function latestGrantingOrderDate(email: string): Date | null {
  const granting = [...fakeOrders.rows.values()]
    .filter((r) => r.email === email && isAccessGrantingStatus(r.status))
    .sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime())
  return granting[0]?.orderDate ?? null
}

const order = { id: '1001', email: 'kupac@primer.rs', status: 'processing', capsulesTotal: 60, date_paid_gmt: '2026-08-24T21:30:00' }

// (c) Dupli webhook za istu porudžbinu → top-up SAMO jednom.
const first = handleWooEvent(order)
const second = handleWooEvent(order) // Woo retry / order.created + order.updated
check('dupli webhook → created pa updated', [first, second], ['created', 'updated'])
check('dupli webhook → kapsule dodate tačno jednom', capsulesToppedUp, 60)
check('dupli webhook → jedan red u orders', fakeOrders.rows.size, 1)
check('datum reda je beogradski 24.08', toBelgradeIso(fakeOrders.rows.get('1001')!.orderDate), '2026-08-24')
check('pre refund-a: porudžbina daje pristup', latestGrantingOrderDate('kupac@primer.rs') !== null, true)

// (b) Refund obara pristup — status postojećeg reda se ažurira, red ostaje.
const refunded = handleWooEvent({ ...order, status: 'refunded' })
check('refund → revoked', refunded, 'revoked')
check('refund → status reda ažuriran', fakeOrders.rows.get('1001')!.status, 'refunded')
check('refund → nema nove porudžbine', fakeOrders.rows.size, 1)
check('posle refund-a: nema porudžbine koja daje pristup', latestGrantingOrderDate('kupac@primer.rs'), null)
// ODLUKA (README „Poznata ograničenja"): kapsule se pri refund-u NE oduzimaju.
check('refund NE oduzima kapsule (svesna odluka)', capsulesToppedUp, 60)

// Refund porudžbine koju nikad nismo sinhronizovali ne sme ništa da napravi.
check('refund nepoznate porudžbine → skipped', handleWooEvent({ ...order, id: '9999', status: 'cancelled' }), 'skipped')
check('refund nepoznate porudžbine → i dalje jedan red', fakeOrders.rows.size, 1)

// Nova porudžbina posle refund-a vraća pristup i naduvava zalihe (nov woo_order_id).
check('nova porudžbina → created', handleWooEvent({ ...order, id: '1002', date_paid_gmt: '2026-09-01T09:00:00' }), 'created')
check('nova porudžbina → +60 kapsula', capsulesToppedUp, 120)
check('nova porudžbina vraća pristup', toBelgradeIso(latestGrantingOrderDate('kupac@primer.rs')!), '2026-09-01')

console.log('\n=== 15. wasInserted: koercija xmax flag-a po drajverima ===')
check('boolean true', wasInserted(true), true)
check('boolean false', wasInserted(false), false)
check("'t'", wasInserted('t'), true)
check("'f'", wasInserted('f'), false)
check("'true'", wasInserted('true'), true)
check("'1'", wasInserted('1'), true)
check('broj 1', wasInserted(1), true)
check('broj 0', wasInserted(0), false)
// Nepoznata vrednost → false: radije propušten top-up nego dupli.
check('undefined → false (fail-safe)', wasInserted(undefined), false)
check('null → false (fail-safe)', wasInserted(null), false)

console.log('\n=== 16. Prozor pristupa: coverage (streak) i VIP moraju biti ISTI dan ===')
// Bug L-H1: coverage je bio kalendarski (`addDaysIso(dan, 60)`), a VIP ms-aritmetika
// (`now - orderDate <= 60 * 24h`). Na poslednjem pokrivenom danu streak je dan smatrao
// pokrivenim, a gejt je korisnika već izbacio na `inactive` — nekompletan „pokriven"
// dan onda RESETUJE niz umesto da ga zamrzne. Sad oba idu kroz `lib/access/window.ts`.
const winOrder = '2026-01-15'
const winEnd = accessWindowEnd(winOrder)            // dan 60
const winDay61 = addDaysIso(winEnd, 1)              // dan 61
check('prozor je 60 kalendarskih dana', ACCESS_WINDOW_DAYS, 60)
check('kraj prozora = dan porudžbine + 60', winEnd, '2026-03-16')
check('dan 60 je tačno 60 dana od porudžbine', daysBetweenIso(winOrder, winEnd), 60)
check('dan 60 → još u prozoru (VIP)', isWithinAccessWindow(winOrder, winEnd), true)
check('dan 61 → van prozora (inactive)', isWithinAccessWindow(winOrder, winDay61), false)
// Isti izvor istine → coverage interval se završava tačno na poslednjem VIP danu.
const winCov = mergeCoveredRanges([winOrder])
check('coverage kraj == kraj VIP prozora', winCov[0][1], winEnd)
check('dan 60: pokriven i VIP (ista odluka)', [isCovered(winEnd, winCov), isWithinAccessWindow(winOrder, winEnd)], [true, true])
check('dan 61: nepokriven i ne-VIP (ista odluka)', [isCovered(winDay61, winCov), isWithinAccessWindow(winOrder, winDay61)], [false, false])

// SQL granica (`maintainAccessStatuses`) je ista odluka, samo obrnuto pročitana:
// `order_date::date >= cutoff` mora da važi tačno za dane koji su u prozoru.
check('cutoff(dan 60) == dan porudžbine → još VIP', accessWindowCutoff(winEnd) <= winOrder, true)
check('cutoff(dan 61) > dan porudžbine → pao VIP', accessWindowCutoff(winDay61) <= winOrder, false)

// Prozor koji prelazi OBA DST prelaza — kalendarski račun ne sme da drifta.
// (Stara ms-aritmetika je ovde gubila/dobijala sat, pa je granica klizila za ceo dan.)
for (const start of ['2026-02-01', '2026-03-01', '2026-09-01', '2026-10-01']) {
  check(`prozor od ${start} je i dalje 60 dana`, daysBetweenIso(start, accessWindowEnd(start)), 60)
}
// Satnica porudžbine više ne pomera granicu: 00:10 i 23:50 istog beogradskog dana
// daju identičan prozor (ranije je večernja porudžbina „istekla" dan ranije).
check(
  'ista beogradska data porudžbine, različita satnica → isti kraj prozora',
  [
    accessWindowEnd(toBelgradeIso(new RealDate('2026-01-14T23:10:00Z'))), // Beograd 00:10, 15.01
    accessWindowEnd(toBelgradeIso(new RealDate('2026-01-15T22:50:00Z'))), // Beograd 23:50, 15.01
  ],
  [winEnd, winEnd],
)

// Scenario iz bug prijave: korisnik je kompletirao sve dane do dana 60 zaključno.
// Dok su prozori bili razdvojeni, dan 60 je bio pokriven ali bez pristupa → reset.
const edgeCov = mergeCoveredRanges([winOrder])
const edgeDone = new Set<string>()
for (let d = '2026-03-12'; d <= winEnd; d = addDaysIso(d, 1)) edgeDone.add(d)
const atEdge = computeStreak({
  completedDates: edgeDone, coveredRanges: edgeCov, today: winEnd, startDate: '2026-03-12',
})
check('dan 60 kompletiran → niz raste (5), nije resetovan', atEdge.current, 5)
// Dan 61 je nepokriven → frozen: niz se pauzira, ne puca (nova kupovina ga nastavlja).
const atDay61 = computeStreak({
  completedDates: edgeDone, coveredRanges: edgeCov, today: winDay61, startDate: '2026-03-12',
})
check('dan 61 (van prozora) → niz zamrznut na 5, ne resetovan', atDay61.current, 5)

console.log('\n=== 17. Check-in: atomičnost zaliha (double-tap, undo, clamp) ===')
// Verna simulacija JEDNE SQL izjave iz `logDose`:
//  - `on conflict do update ... where status is distinct from excluded.status`
//    → pri nepromenjenom statusu update se NE dešava i `returning` ne vraća red (delta 0).
//  - `xmax = 0` razlikuje insert od tranzicije (prvi `skipped` ne vraća kapsule).
//  - zalihe se menjaju SQL deltom nad TEKUĆOM vrednošću, ne nad ranije pročitanom.
type DoseKey = `${string}|${'morning' | 'evening'}`
function makeProtocol(startCapsules: number) {
  const logs = new Map<DoseKey, 'taken' | 'skipped'>()
  let capsules = startCapsules
  return {
    get capsules() { return capsules },
    logDose(date: string, dose: 'morning' | 'evening', status: 'taken' | 'skipped') {
      const key: DoseKey = `${date}|${dose}`
      const prev = logs.get(key)
      if (prev === status) return { changed: false, capsules } // guard: nema reda u RETURNING
      const inserted = prev === undefined
      logs.set(key, status)
      const delta = status === 'taken' ? -CAPSULES_PER_DOSE : inserted ? 0 : CAPSULES_PER_DOSE
      if (delta < 0) capsules = Math.max(0, capsules + delta)
      // Povraćaj se ne izvršava na nuli — clamp je možda već pojeo deo, a bez pamćenja
      // potrošenog po logu to se ne razlikuje. Nikad ne kujemo kapsule.
      else if (delta > 0 && capsules > 0) capsules += delta
      return { changed: true, capsules }
    },
  }
}

// (a) Double-tap na istu dozu: druga izjava ne menja status → delta 0.
const dbl = makeProtocol(60)
const tap1 = dbl.logDose('2026-08-24', 'morning', 'taken')
const tap2 = dbl.logDose('2026-08-24', 'morning', 'taken')
check('double-tap → prvi menja, drugi ne', [tap1.changed, tap2.changed], [true, false])
check('double-tap skida kapsule tačno jednom (60 → 58)', dbl.capsules, 60 - CAPSULES_PER_DOSE)
const tap3 = dbl.logDose('2026-08-24', 'morning', 'taken')
check('treći tap i dalje 58', [tap3.changed, dbl.capsules], [false, 58])

// (b) check-in → undo ne sme da podigne zalihe IZNAD polaznih (stara clamp asimetrija
//     je kovala kapsule: 1 → check-in → 0 → undo → 2).
for (const start of [0, 1, 2, 3, 4, 10, 59, 60]) {
  const p = makeProtocol(start)
  p.logDose('2026-08-24', 'morning', 'taken')
  p.logDose('2026-08-24', 'morning', 'skipped')
  check(`start ${start}: check-in → undo ne prelazi polazno`, p.capsules <= start, true)
}
// Iznad clamp zone je povraćaj TAČAN (potrošeno == vraćeno).
for (const start of [4, 10, 60]) {
  const p = makeProtocol(start)
  p.logDose('2026-08-24', 'evening', 'taken')
  p.logDose('2026-08-24', 'evening', 'skipped')
  check(`start ${start}: undo vraća tačno potrošeno`, p.capsules, start)
}
// U clamp zoni radije gubimo nego kujemo (dokumentovana odluka u `logDose`).
const zero = makeProtocol(0)
zero.logDose('2026-08-24', 'morning', 'taken')
check('0 kapsula: check-in ostaje na 0', zero.capsules, 0)
zero.logDose('2026-08-24', 'morning', 'skipped')
check('0 kapsula: undo NE kuje kapsule', zero.capsules, 0)
const odd = makeProtocol(1)
odd.logDose('2026-08-24', 'morning', 'taken')
odd.logDose('2026-08-24', 'morning', 'skipped')
check('1 kapsula: 1 → 0 → undo ostaje 0 (ne 2)', odd.capsules, 0)

// (c) Prvi upis `skipped` je INSERT, ne tranzicija — ne sme da vrati kapsule.
const skipFirst = makeProtocol(60)
const skipRes = skipFirst.logDose('2026-08-24', 'evening', 'skipped')
check('prvi `skipped` menja log ali ne dira zalihe', [skipRes.changed, skipFirst.capsules], [true, 60])

// (d) Dve različite doze istog dana su nezavisne — obe skidaju.
const both = makeProtocol(60)
both.logDose('2026-08-24', 'morning', 'taken')
both.logDose('2026-08-24', 'evening', 'taken')
check('obe doze → dnevna potrošnja = CAPSULES_PER_DAY', 60 - both.capsules, CAPSULES_PER_DAY)

// (e) SQL izraz za `estimated_runout_date` (`today + ceil(kapsule / 4)`) mora da daje
//     isto što i `estimateRunoutDate` — inače zalihe i UI računaju različit istek.
for (const caps of [0, 1, 2, 3, 4, 14, 58, 60]) {
  check(
    `runout(24.08, ${caps} kaps) == SQL ceil(${caps}/${CAPSULES_PER_DAY})`,
    estimateRunoutDate('2026-08-24', caps),
    addDaysIso('2026-08-24', Math.ceil(caps / CAPSULES_PER_DAY)),
  )
}


console.log('\n=== 12. Access override (L-M2) — prioritet role, override-a i porudžbine ===')
// Zašto ovaj blok postoji: override je ranije pisao u `access_status`, koji
// `refreshAccessStatusForProfile` prepisuje na SVAKI ulaz korisnika u app. Prvi
// sledeći page load ga je poništavao — u oba smera. Sada je zasebna kolona i ovde
// se fiksira tačan prioritet, jer je to jedino što odlučuje ko ulazi u aplikaciju.
freeze('2026-08-25T09:00:00Z')
{
  const now = new Date()
  const svez = new RealDate('2026-08-01T10:00:00Z')   // u prozoru (60 dana)
  const star = new RealDate('2026-01-01T10:00:00Z')   // van prozora

  const R = (p: Parameters<typeof resolveAccessStatus>[0]) => resolveAccessStatus(p)

  // Bez override-a: staro ponašanje mora ostati netaknuto.
  check('bez override-a, sveža porudžbina → vip',
    R({ role: 'user', currentStatus: 'inactive', latestOrderDate: svez, now }), 'vip')
  check('bez override-a, stara porudžbina → inactive',
    R({ role: 'user', currentStatus: 'vip', latestOrderDate: star, now }), 'inactive')
  check('bez override-a, bez porudžbine → inactive',
    R({ role: 'user', currentStatus: 'vip', latestOrderDate: null, now }), 'inactive')
  check('subscriber ostaje subscriber (Faza 2)',
    R({ role: 'user', currentStatus: 'subscriber', latestOrderDate: null, now }), 'subscriber')

  // Override nadjačava porudžbinu u OBA smera — to je ceo smisao ispravke.
  check('override vip bez porudžbine → vip',
    R({ role: 'user', currentStatus: 'inactive', latestOrderDate: null, now, override: 'vip' }), 'vip')
  check('override inactive UPRKOS svežoj porudžbini → inactive',
    R({ role: 'user', currentStatus: 'vip', latestOrderDate: svez, now, override: 'inactive' }), 'inactive')
  check('override nadjačava subscriber',
    R({ role: 'user', currentStatus: 'subscriber', latestOrderDate: null, now, override: 'inactive' }), 'inactive')

  // Rola je IZNAD override-a: admin ne sme da se zaključa van aplikacije.
  check('admin + override inactive → i dalje vip',
    R({ role: 'admin', currentStatus: 'inactive', latestOrderDate: null, now, override: 'inactive' }), 'vip')
  check('admin bez porudžbine → vip',
    R({ role: 'admin', currentStatus: 'inactive', latestOrderDate: null, now }), 'vip')

  // Ključna regresija: ponovljeni refresh mora dati ISTU vrednost (idempotentno).
  // Stari bug je bio baš to — drugi prolaz je vraćao nešto drugo.
  let st = R({ role: 'user', currentStatus: 'vip', latestOrderDate: null, now, override: 'vip' })
  for (let i = 0; i < 5; i++) {
    st = R({ role: 'user', currentStatus: st, latestOrderDate: null, now, override: 'vip' })
  }
  check('override preživi 5 uzastopnih refresh-eva', st, 'vip')

  let bl = R({ role: 'user', currentStatus: 'inactive', latestOrderDate: svez, now, override: 'inactive' })
  for (let i = 0; i < 5; i++) {
    bl = R({ role: 'user', currentStatus: bl, latestOrderDate: svez, now, override: 'inactive' })
  }
  check('blokada preživi 5 refresh-eva uz svežu porudžbinu', bl, 'inactive')

  // `subscriber` kroz override je zabranjen (CHECK u bazi); kod ga svodi na null.
  check('asOverride: vip/inactive prolaze', [asOverride('vip'), asOverride('inactive')], ['vip', 'inactive'])
  check('asOverride: subscriber → null (ne sme kroz override)', asOverride('subscriber'), null)
  check('asOverride: null/undefined → null', [asOverride(null), asOverride(undefined)], [null, null])
}
unfreeze()

console.log('\n=== 13. Cap low-stock alerta po epizodi (V10) ===')
// Simulacija `supply` reda: dedup (3 dana) ograničava UČESTALOST, ovaj brojač
// ograničava UKUPAN broj po epizodi. Reset je vezan za STANJE (kapsule iznad
// praga), ne za događaj „dopuna" — inače bi ga neki put upisa zaboravio.
function makeSupply(capsules: number) {
  const row = { capsules, alertsSent: 0 }
  return {
    get state() { return { ...row } },
    /** Bilo koji upis zaliha (ručna korekcija, Woo top-up, undo check-ina). */
    write(next: number) {
      row.capsules = next
      if (next > LOW_STOCK_THRESHOLD) row.alertsSent = 0
    },
    /** Jedan prolaz cron-a; vraća da li je alert izašao. */
    cronPass(): boolean {
      if (row.capsules > LOW_STOCK_THRESHOLD) return false
      if (row.alertsSent >= LOW_STOCK_MAX_ALERTS_PER_EPISODE) return false
      row.alertsSent += 1
      return true
    },
  }
}

const sup = makeSupply(10)
const prvaEpizoda = [sup.cronPass(), sup.cronPass(), sup.cronPass(), sup.cronPass(), sup.cronPass()]
check(`prva epizoda: tačno ${LOW_STOCK_MAX_ALERTS_PER_EPISODE} alerta pa tišina`,
  prvaEpizoda, [true, true, true, false, false])
check('brojač stao na cap-u', sup.state.alertsSent, LOW_STOCK_MAX_ALERTS_PER_EPISODE)

// Dopuna ISPOD praga ne otvara novu rundu — inače bi refill od 1 kapsule resetovao cap.
sup.write(LOW_STOCK_THRESHOLD)
check('dopuna do praga NE resetuje brojač', sup.state.alertsSent, LOW_STOCK_MAX_ALERTS_PER_EPISODE)
check('i dalje ćuti', sup.cronPass(), false)

// Prelazak PREKO praga zatvara epizodu.
sup.write(LOW_STOCK_THRESHOLD + 1)
check('prelazak preko praga resetuje brojač', sup.state.alertsSent, 0)
check('iznad praga se ne šalje ništa', sup.cronPass(), false)

// Nova epizoda dobija pun budžet.
sup.write(8)
const drugaEpizoda = [sup.cronPass(), sup.cronPass(), sup.cronPass(), sup.cronPass()]
check('druga epizoda ponovo dobija pun budžet', drugaEpizoda, [true, true, true, false])

// Svaki put upisa mora resetovati isto (Woo top-up, ručna korekcija, undo check-ina).
for (const [label, target] of [
  ['Woo top-up (+60)', 8 + 60],
  ['ručna korekcija', 40],
  ['undo check-ina (+2 preko praga)', LOW_STOCK_THRESHOLD + 2],
] as const) {
  const p = makeSupply(8)
  p.cronPass(); p.cronPass()
  p.write(target)
  check(`${label} resetuje brojač`, p.state.alertsSent, 0)
}

console.log('\n=== 14. Odjavni token (List-Unsubscribe, V10) ===')
// Ruta je JAVNA (Gmail one-click POST nema Clerk sesiju), pa je potpis jedina brava.
// Pokvaren potpis znači ili odjavu koja ne radi (→ prijava spama) ili odjavu koju
// može da izvede bilo ko (→ gašenje tuđih alerta).
process.env.EMAIL_UNSUBSCRIBE_SECRET = 'qa-test-secret-0123456789'
const { unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl, unsubscribeHeaders } =
  await import('../lib/email/unsubscribe')

const tokenA = unsubscribeToken('user_aaa')!
const tokenB = unsubscribeToken('user_bbb')!
check('token je 64 hex znaka (SHA-256)', /^[0-9a-f]{64}$/.test(tokenA), true)
check('isti korisnik → isti token (deterministički)', unsubscribeToken('user_aaa'), tokenA)
check('različiti korisnici → različiti tokeni', tokenA !== tokenB, true)
check('validan token prolazi', verifyUnsubscribeToken('user_aaa', tokenA), true)
check('TUĐI token ne prolazi', verifyUnsubscribeToken('user_aaa', tokenB), false)
check('izmenjen token ne prolazi', verifyUnsubscribeToken('user_aaa', tokenA.slice(0, -1) + (tokenA.endsWith('0') ? '1' : '0')), false)
check('skraćen token ne prolazi (bez bacanja)', verifyUnsubscribeToken('user_aaa', tokenA.slice(0, 10)), false)
check('prazan token ne prolazi', verifyUnsubscribeToken('user_aaa', ''), false)
check('URL nosi i korisnika i token', unsubscribeUrl('user_aaa')!.includes(`u=user_aaa&t=${tokenA}`), true)
check('zaglavlja su RFC 8058 par', Object.keys(unsubscribeHeaders('user_aaa')).sort(),
  ['List-Unsubscribe', 'List-Unsubscribe-Post'])
check('List-Unsubscribe je u uglastim zagradama',
  unsubscribeHeaders('user_aaa')['List-Unsubscribe']!.startsWith('<'), true)
check('one-click je deklarisan',
  unsubscribeHeaders('user_aaa')['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')

console.log(`\n──────────────\nRezultat: ${pass} prošlo, ${fail} palo\n`)
process.exit(fail > 0 ? 1 : 0)
