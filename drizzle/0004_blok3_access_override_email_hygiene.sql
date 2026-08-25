ALTER TABLE "profiles" ADD COLUMN "access_override" "access_status";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "access_override_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "access_override_by" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "email_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "supply" ADD COLUMN "low_stock_alerts_sent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_access_override_values" CHECK ("profiles"."access_override" is null or "profiles"."access_override" in ('vip', 'inactive'));