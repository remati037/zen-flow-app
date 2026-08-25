import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// ────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────

export const roleEnum = pgEnum('role', ['admin', 'user'])
export const accessStatusEnum = pgEnum('access_status', ['vip', 'inactive', 'subscriber'])
export const productTypeEnum = pgEnum('product_type', ['full', 'refill'])
export const doseEnum = pgEnum('dose', ['morning', 'evening'])
export const protocolStatusEnum = pgEnum('protocol_status', ['taken', 'skipped'])
export const channelEnum = pgEnum('channel', ['push', 'email'])

// ────────────────────────────────────────────────────────────
// profiles — korisnički nalog (id = Clerk user id)
// ────────────────────────────────────────────────────────────

export const profiles = pgTable(
  'profiles',
  {
    id: text('id').primaryKey(), // Clerk user id
    email: text('email').notNull().unique(),
    name: text('name'),
    role: roleEnum('role').notNull().default('user'),
    /**
     * IZVEDENA vrednost — rezultat `resolveAccessStatus`. Čitaju je gejt u layout-u,
     * `createAction` i admin lista. Nikad se ne upisuje ručno mimo te funkcije.
     */
    accessStatus: accessStatusEnum('access_status').notNull().default('inactive'),
    /**
     * Ručni admin override pristupa. `null` = nema override-a, status se izvodi iz
     * porudžbina (normalno stanje).
     *
     * Postoji zbog konkretnog bug-a (L-M2): override je ranije pisao direktno u
     * `access_status`, a `refreshAccessStatusForProfile` se zove na SVAKI ulaz u app
     * i na SVAKU server akciju — pa je prvi sledeći page load korisnika override
     * pregazio izvedenom vrednošću. To je važilo u OBA smera, i gori smer je bio
     * `inactive`: admin blokira nalog, korisnik osveži stranicu i opet je VIP.
     * Admin UI je uz to tvrdio da ga poništava „noćni cron" — poništavao ga je
     * korisnik sam, u sekundi.
     *
     * Samo `vip` | `inactive` (CHECK ispod). `subscriber` je Faza 2 / Stripe i
     * dodeljuje ga naplata, ne admin.
     */
    accessOverride: accessStatusEnum('access_override'),
    /** Kad je override postavljen — da admin vidi koliko je star. */
    accessOverrideAt: timestamp('access_override_at', { withTimezone: true }),
    /** Clerk user id admina koji je postavio override (revizija „ko je pustio koga"). */
    accessOverrideBy: text('access_override_by'),
    /**
     * Da li korisnik prima ALERT mejlove (low-stock). `false` = opt-out iz
     * Podešavanja ili iz List-Unsubscribe zaglavlja u samom mejlu.
     *
     * NE gasi transakcione mejlove (welcome) — oni su posledica radnje korisnika,
     * ne raspored. Vidi `lib/email/send.ts` (`EMAIL_ALERT_TYPES`).
     */
    emailAlerts: boolean('email_alerts').notNull().default(true),
    protocolStartDate: date('protocol_start_date'),
    doseMorningTime: time('dose_morning_time'),
    doseEveningTime: time('dose_evening_time'),
    focusScoreBaseline: integer('focus_score_baseline'),
    onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * Invarijanta na nivou baze, ne samo zod-a: override sme da bude samo `vip`
     * ili `inactive`. `subscriber` kroz override bi značio da admin ručno dodeljuje
     * pretplatu koju niko nije platio, i to bi preživelo svaki refresh.
     */
    check(
      'profiles_access_override_values',
      sql`${t.accessOverride} is null or ${t.accessOverride} in ('vip', 'inactive')`,
    ),
  ],
)

// ────────────────────────────────────────────────────────────
// orders — WooCommerce sync porudžbine
// ────────────────────────────────────────────────────────────

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    wooOrderId: text('woo_order_id').notNull().unique(),
    email: text('email').notNull(),
    productType: productTypeEnum('product_type').notNull(),
    quantityPackages: integer('quantity_packages').notNull().default(1),
    capsulesTotal: integer('capsules_total').notNull(),
    orderDate: timestamp('order_date', { withTimezone: true }).notNull(),
    status: text('status').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * FUNKCIONALNI indeks — mora da prati `lower(email)` jer svaki upit koji iz `orders`
     * izvodi PRISTUP poredi mejl case-insensitive (`getLatestOrderDate`,
     * `maintainAccessStatuses`, onboarding prefil). Nad običnim `(email)` indeksom
     * `lower(email) = $1` ne može da se koristi → seq scan.
     *
     * `order_date DESC` je drugi ključ zbog `order by order_date desc limit 1` u
     * `getLatestOrderDate` — sa gejtom pristupa u `createAction` taj upit sada ide
     * na SVAKU server akciju, pa mora da bude index-only skok, ne sort.
     */
    index('orders_email_lower_date_idx').on(sql`lower(${t.email})`, t.orderDate.desc()),
  ],
)

// ────────────────────────────────────────────────────────────
// protocol_logs — dnevni check-in po dozi (osnova streak-a)
// ────────────────────────────────────────────────────────────

export const protocolLogs = pgTable(
  'protocol_logs',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    dose: doseEnum('dose').notNull(),
    takenAt: timestamp('taken_at', { withTimezone: true }),
    status: protocolStatusEnum('status').notNull().default('taken'),
  },
  (t) => [
    unique('protocol_logs_user_date_dose_uq').on(t.userId, t.date, t.dose),
    /**
     * PARCIJALNI indeks. `(user_id, date, dose)` unique već pokriva upite po korisniku,
     * ali agregati koji gledaju SVE korisnike za jedan dan/raspon (admin metrike,
     * dispatcher podsetnika, doslednost) filtriraju po `date` + `status = 'taken'`.
     * `skipped` redovi su mrtav teret za te upite, pa ih parcijalni uslov izbacuje iz
     * indeksa umesto da ih svaki scan preskače. Nosioci: `lib/admin/metrics.ts`
     * (`date = today and status = 'taken'`, pa `date >= seriesStart` + group by).
     */
    index('protocol_logs_date_taken_idx')
      .on(t.date)
      .where(sql`${t.status} = 'taken'`),
  ],
)

// ────────────────────────────────────────────────────────────
// supply — preostale kapsule i predviđanje isteka (1:1 sa profilom)
// ────────────────────────────────────────────────────────────

export const supply = pgTable('supply', {
  userId: text('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  capsulesRemaining: integer('capsules_remaining').notNull().default(0),
  estimatedRunoutDate: date('estimated_runout_date'),
  /**
   * Koliko je low-stock alerta poslato u TEKUĆOJ epizodi niskih zaliha.
   *
   * Epizoda počinje kad zalihe padnu na/ispod `LOW_STOCK_THRESHOLD` i traje dok ne
   * pređu prag (top-up iz Woo-a, ručna korekcija, ili undo check-ina). Svaki upis
   * u `supply` koji digne zalihe iznad praga vraća brojač na 0 — reset je vezan za
   * STANJE, ne za događaj, pa nijedan put upisa ne može da ga zaboravi.
   *
   * Postoji jer 3-dnevni dedup sam po sebi nije cap: korisnik koji ostane bez
   * zaliha i ne dokupi mesec dana dobija ~10 istih mejlova. Posle
   * `LOW_STOCK_MAX_ALERTS_PER_EPISODE` alerta epizoda utihne — poruka koja se
   * ponavlja u nedogled se ne čita, ona se prijavljuje kao spam.
   */
  lowStockAlertsSent: integer('low_stock_alerts_sent').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ────────────────────────────────────────────────────────────
// focus_sessions — Pomodoro blokovi
// ────────────────────────────────────────────────────────────

export const focusSessions = pgTable(
  'focus_sessions',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    durationMin: integer('duration_min').notNull(),
    completed: boolean('completed').notNull().default(false),
    taskLabel: text('task_label'),
  },
  // Sve čitanje ide po korisniku (dashboard agregat, bedževi). Bez ovoga i FK
  // `on delete cascade` mora da skenira celu tabelu pri brisanju naloga.
  (t) => [index('focus_sessions_user_idx').on(t.userId)],
)

// ────────────────────────────────────────────────────────────
// daily_tasks — dnevni zadaci
// ────────────────────────────────────────────────────────────

export const dailyTasks = pgTable(
  'daily_tasks',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    title: text('title').notNull(),
    done: boolean('done').notNull().default(false),
  },
  // `/fokus` uvek čita „moji zadaci za današnji beogradski dan"; isti upit nosi i
  // server-side limit od 3 zadatka, pa se izvršava i pri svakom `addTask`.
  (t) => [index('daily_tasks_user_date_idx').on(t.userId, t.date)],
)

// ────────────────────────────────────────────────────────────
// badges — osvojeni bedževi
// ────────────────────────────────────────────────────────────

export const badges = pgTable(
  'badges',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    badgeKey: text('badge_key').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('badges_user_key_uq').on(t.userId, t.badgeKey)],
)

// ────────────────────────────────────────────────────────────
// push_subscriptions — Web Push pretplate
// ────────────────────────────────────────────────────────────

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    /**
     * Kad je pretplata poslednji put POTVRĐENA sa uređaja (subscribe, re-upsert na
     * app load, ili rotacija endpoint-a). Bez ovoga se "pretplata postoji u bazi"
     * ne razlikuje od "pretplata je živa": endpoint koji je browser odbacio ostaje
     * u tabeli dok push servis ne vrati 410, a to se dešava tek pri sledećem slanju.
     * Dijagnostika ga prikazuje da admin vidi da li uređaj još javlja da postoji.
     */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // `sendPushToUser` na SVAKO slanje radi `where user_id = ?`, a dispatcher to zove
  // po korisniku u batch-u. Bez indeksa je to seq scan po tabeli koja raste sa svakim
  // uređajem; isti indeks nosi i `on delete cascade` pri brisanju naloga.
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
)

// ────────────────────────────────────────────────────────────
// notifications_log — istorija poslatih notifikacija
// ────────────────────────────────────────────────────────────

export const notificationsLog = pgTable(
  'notifications_log',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    channel: channelEnum('channel').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    /** 'pending' (rezervisano, slanje u toku) → 'success' | 'failed'. */
    status: text('status').notNull(),
    /**
     * Beogradski kalendarski dan za koji je slanje REZERVISANO — ključ dedup-a.
     *
     * Postoji jer je dedup ranije bio check-then-act: `filterNotifiedSince` pročita
     * da nema reda, pa se šalje. Dva preklapajuća run-a dispatchera (GitHub Actions
     * ume da pokrene dva posla u istom prozoru) prođu obe provere pre nego što bilo
     * koji upiše red — i korisnik dobije dva ista podsetnika. Sada je red REZERVACIJA
     * koju pravi `claimNotification` PRE slanja, a jedinstveni indeks ispod je taj
     * koji odlučuje ko je prvi; gubitnik dobija `null` i preskače.
     *
     * `null` znači „red nije rezervacija": obično logovanje (npr. ad-hoc admin test)
     * ili OSLOBOĐENA rezervacija posle neuspelog slanja. Zato je indeks parcijalan —
     * ti redovi ne smeju da troše slot za taj dan.
     */
    dedupDay: date('dedup_day'),
  },
  (t) => [
    // Redosled kolona prati dedup upit iz `lib/push/dedup.ts`:
    //   user_id in (...) and type = ? and status = 'success' and sent_at >= ?
    // Dispatcher ga zove na svakih 15 min za ceo skup korisnika — najtopliji upit u tabeli
    // koja raste monotono.
    index('notifications_log_user_type_status_sent_idx').on(
      t.userId,
      t.type,
      t.status,
      t.sentAt,
    ),
    /**
     * JEDINI mehanizam koji stvarno sprečava duplikat. Bulk `filterNotifiedSince`
     * ostaje kao jeftin pred-filter (štedi rezervaciju i slanje za ogromnu većinu),
     * ali je po prirodi trka — atomarnost je ovde.
     *
     * `channel` je u ključu jer low-stock ide i na mejl i na push nezavisno; bez njega
     * bi poslat mejl blokirao push. PARCIJALAN je (`dedup_day is not null`) da redovi
     * bez rezervacije i oslobođene rezervacije ne zauzimaju slot.
     *
     * `on conflict` arbiter mora da ponovi isti predikat — vidi `claimNotification`.
     */
    uniqueIndex('notifications_log_dedup_uq')
      .on(t.userId, t.type, t.channel, t.dedupDay)
      .where(sql`${t.dedupDay} is not null`),
  ],
)

// ────────────────────────────────────────────────────────────
// cron_runs — heartbeat zakazanih poslova (jedan red po poslu)
// ────────────────────────────────────────────────────────────

/**
 * Dokaz da je scheduler ŽIV.
 *
 * Postoji zbog najgoreg otkaza podsetnika: dispatcher se prosto ne poziva.
 * `notifications_log` to ne može da pokaže — run koji nije imao kome da pošalje
 * ne ostavlja nijedan red, pa "nema podsetnika" izgleda isto kao "nema kandidata"
 * i kao "GitHub Actions je oborio raspored". Ovde svaki run ostavlja trag bez
 * obzira na ishod, pa dijagnostika može da razlikuje ta tri slučaja.
 *
 * Jedan red po poslu (`job` je PK) — tabela ne raste, ne treba joj čišćenje.
 * Rupe se pamte agregatno (`last_gap_min` / `max_gap_min` + kad se desila),
 * umesto istorije run-ova koju bi trebalo prunovati.
 */
export const cronRuns = pgTable('cron_runs', {
  /** Stabilan ključ posla, npr. 'notifications' | 'low-stock'. Vidi CRON_JOBS u lib/cron/health.ts. */
  job: text('job').primaryKey(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }).notNull().defaultNow(),
  /** Minuta između prethodnog i ovog run-a. `null` samo za prvi run ikad. */
  lastGapMin: integer('last_gap_min'),
  /** Najveća ikad izmerena rupa — preživi restart i ne gubi se u rotaciji logova. */
  maxGapMin: integer('max_gap_min'),
  maxGapAt: timestamp('max_gap_at', { withTimezone: true }),
  runsTotal: integer('runs_total').notNull().default(1),
  /** Poslednji JSON odgovor rute — brojači po tipu, za dijagnostiku bez Vercel logova. */
  lastResult: jsonb('last_result'),
})

// ────────────────────────────────────────────────────────────
// focus_quiz_results — Focus Score kviz rezultati
// ────────────────────────────────────────────────────────────

export const focusQuizResults = pgTable(
  'focus_quiz_results',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    score: integer('score').notNull(),
    answers: jsonb('answers'),
  },
  // Baseline i poređenje kroz vreme se čitaju po korisniku, hronološki.
  (t) => [index('focus_quiz_results_user_date_idx').on(t.userId, t.date)],
)

// ────────────────────────────────────────────────────────────
// Relations
// ────────────────────────────────────────────────────────────

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  supply: one(supply, {
    fields: [profiles.id],
    references: [supply.userId],
  }),
  protocolLogs: many(protocolLogs),
  focusSessions: many(focusSessions),
  dailyTasks: many(dailyTasks),
  badges: many(badges),
  pushSubscriptions: many(pushSubscriptions),
  notificationsLog: many(notificationsLog),
  focusQuizResults: many(focusQuizResults),
}))

export const supplyRelations = relations(supply, ({ one }) => ({
  profile: one(profiles, {
    fields: [supply.userId],
    references: [profiles.id],
  }),
}))

export const protocolLogsRelations = relations(protocolLogs, ({ one }) => ({
  profile: one(profiles, {
    fields: [protocolLogs.userId],
    references: [profiles.id],
  }),
}))

export const focusSessionsRelations = relations(focusSessions, ({ one }) => ({
  profile: one(profiles, {
    fields: [focusSessions.userId],
    references: [profiles.id],
  }),
}))

export const dailyTasksRelations = relations(dailyTasks, ({ one }) => ({
  profile: one(profiles, {
    fields: [dailyTasks.userId],
    references: [profiles.id],
  }),
}))

export const badgesRelations = relations(badges, ({ one }) => ({
  profile: one(profiles, {
    fields: [badges.userId],
    references: [profiles.id],
  }),
}))

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  profile: one(profiles, {
    fields: [pushSubscriptions.userId],
    references: [profiles.id],
  }),
}))

export const notificationsLogRelations = relations(notificationsLog, ({ one }) => ({
  profile: one(profiles, {
    fields: [notificationsLog.userId],
    references: [profiles.id],
  }),
}))

export const focusQuizResultsRelations = relations(focusQuizResults, ({ one }) => ({
  profile: one(profiles, {
    fields: [focusQuizResults.userId],
    references: [profiles.id],
  }),
}))
