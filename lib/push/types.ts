/**
 * Centralni union tipova notifikacija — koristi ga dispatcher i dedup sloj.
 * `notifications_log.type` i `sendPushToUser`/`sendEmail` primaju slobodan string
 * radi kompatibilnosti, ali novi kod tipuje kroz ovaj union.
 */
export type NotificationType =
  | 'dose_reminder_morning'
  | 'dose_reminder_evening'
  | 'streak_at_risk'
  | 'low_stock_alert'
  | 'welcome'
  | 'test'
