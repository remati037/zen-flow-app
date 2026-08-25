CREATE TABLE "cron_runs" (
	"job" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_gap_min" integer,
	"max_gap_min" integer,
	"max_gap_at" timestamp with time zone,
	"runs_total" integer DEFAULT 1 NOT NULL,
	"last_result" jsonb
);
