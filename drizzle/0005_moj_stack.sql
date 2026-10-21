CREATE TYPE "public"."supplement_time" AS ENUM('morning', 'afternoon', 'evening');--> statement-breakpoint
CREATE TABLE "user_supplements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"catalog_key" text,
	"custom_name" text,
	"time_of_day" "supplement_time" NOT NULL,
	"dose_note" text,
	"active" boolean DEFAULT true NOT NULL,
	"merged_into_key" text,
	"last_confirmed_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_supplements_one_name" CHECK (num_nonnulls("user_supplements"."catalog_key", "user_supplements"."custom_name") = 1),
	CONSTRAINT "user_supplements_merge_custom_only" CHECK ("user_supplements"."merged_into_key" is null or "user_supplements"."custom_name" is not null)
);
--> statement-breakpoint
ALTER TABLE "user_supplements" ADD CONSTRAINT "user_supplements_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_supplements_user_catalog_uq" ON "user_supplements" USING btree ("user_id","catalog_key") WHERE "user_supplements"."catalog_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_supplements_user_custom_uq" ON "user_supplements" USING btree ("user_id",lower("custom_name")) WHERE "user_supplements"."custom_name" is not null;--> statement-breakpoint
CREATE INDEX "user_supplements_user_idx" ON "user_supplements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_supplements_catalog_active_idx" ON "user_supplements" USING btree ("catalog_key") WHERE "user_supplements"."active";