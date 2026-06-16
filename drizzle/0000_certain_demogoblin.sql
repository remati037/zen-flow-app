CREATE TYPE "public"."access_status" AS ENUM('vip', 'inactive', 'subscriber');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('push', 'email');--> statement-breakpoint
CREATE TYPE "public"."dose" AS ENUM('morning', 'evening');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('full', 'refill');--> statement-breakpoint
CREATE TYPE "public"."protocol_status" AS ENUM('taken', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "badges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"badge_key" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badges_user_key_uq" UNIQUE("user_id","badge_key")
);
--> statement-breakpoint
CREATE TABLE "daily_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "focus_quiz_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"score" integer NOT NULL,
	"answers" jsonb
);
--> statement-breakpoint
CREATE TABLE "focus_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_min" integer NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"task_label" text
);
--> statement-breakpoint
CREATE TABLE "notifications_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"channel" "channel" NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"woo_order_id" text NOT NULL,
	"email" text NOT NULL,
	"product_type" "product_type" NOT NULL,
	"quantity_packages" integer DEFAULT 1 NOT NULL,
	"capsules_total" integer NOT NULL,
	"order_date" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_woo_order_id_unique" UNIQUE("woo_order_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "role" DEFAULT 'user' NOT NULL,
	"access_status" "access_status" DEFAULT 'inactive' NOT NULL,
	"protocol_start_date" date,
	"dose_morning_time" time,
	"dose_evening_time" time,
	"focus_score_baseline" integer,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "protocol_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"dose" "dose" NOT NULL,
	"taken_at" timestamp with time zone,
	"status" "protocol_status" DEFAULT 'taken' NOT NULL,
	CONSTRAINT "protocol_logs_user_date_dose_uq" UNIQUE("user_id","date","dose")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "supply" (
	"user_id" text PRIMARY KEY NOT NULL,
	"capsules_remaining" integer DEFAULT 0 NOT NULL,
	"estimated_runout_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_quiz_results" ADD CONSTRAINT "focus_quiz_results_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD CONSTRAINT "notifications_log_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_logs" ADD CONSTRAINT "protocol_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply" ADD CONSTRAINT "supply_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;