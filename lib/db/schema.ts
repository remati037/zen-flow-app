import { relations, sql } from 'drizzle-orm'
import {
  boolean,
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

export const profiles = pgTable('profiles', {
  id: text('id').primaryKey(), // Clerk user id
  email: text('email').notNull().unique(),
  name: text('name'),
  role: roleEnum('role').notNull().default('user'),
  accessStatus: accessStatusEnum('access_status').notNull().default('inactive'),
  protocolStartDate: date('protocol_start_date'),
  doseMorningTime: time('dose_morning_time'),
  doseEveningTime: time('dose_evening_time'),
  focusScoreBaseline: integer('focus_score_baseline'),
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

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

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
})

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
    status: text('status').notNull(),
  },
  // Redosled kolona prati dedup upit iz `lib/push/dedup.ts`:
  //   user_id in (...) and type = ? and status = 'success' and sent_at >= ?
  // Dispatcher ga zove na svakih 15 min za ceo skup korisnika — najtopliji upit u tabeli
  // koja raste monotono.
  (t) => [
    index('notifications_log_user_type_status_sent_idx').on(
      t.userId,
      t.type,
      t.status,
      t.sentAt,
    ),
  ],
)

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
