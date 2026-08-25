ALTER TABLE "notifications_log" ADD COLUMN "dedup_day" date;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_log_dedup_uq" ON "notifications_log" USING btree ("user_id","type","channel","dedup_day") WHERE "notifications_log"."dedup_day" is not null;--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");