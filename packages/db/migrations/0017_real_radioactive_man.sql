CREATE TABLE "market_daily_price" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_daily_price_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"symbol" varchar(20) NOT NULL,
	"date" date NOT NULL,
	"open" numeric(18, 6) NOT NULL,
	"high" numeric(18, 6) NOT NULL,
	"low" numeric(18, 6) NOT NULL,
	"close" numeric(18, 6) NOT NULL,
	"adjusted_close" numeric(18, 6) NOT NULL,
	"volume" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_daily_price_symbol_date_key" UNIQUE("symbol","date")
);
--> statement-breakpoint
CREATE TABLE "market_rotation_snapshot_run" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_rotation_snapshot_run_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"rank_scope" varchar(20) NOT NULL,
	"snapshot_date" date,
	"status" varchar(32) NOT NULL,
	"symbol_count" integer DEFAULT 0 NOT NULL,
	"qualified_symbol_count" integer DEFAULT 0 NOT NULL,
	"upserted_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_rotation_snapshot" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_rotation_snapshot_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"date" date NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"rank_scope" varchar(20) NOT NULL,
	"group_type" varchar(20) NOT NULL,
	"sector_name" varchar(100),
	"last_price" numeric(18, 6),
	"adjusted_close" numeric(18, 6),
	"daily_change_pct" numeric(10, 4),
	"weekly_change_pct" numeric(10, 4),
	"two_week_performance_pct" numeric(10, 4),
	"rsi14" numeric(8, 4),
	"rsi_percentile" numeric(8, 4),
	"rsi_delta_2w" numeric(8, 4),
	"ema10" numeric(18, 6),
	"ema20" numeric(18, 6),
	"sma50" numeric(18, 6),
	"sma200" numeric(18, 6),
	"above10d" boolean,
	"above20d" boolean,
	"above50d" boolean,
	"above200d" boolean,
	"ma_score" integer,
	"ma_score_percentile" numeric(8, 4),
	"ma_status" varchar(32),
	"rolling_252d_high" numeric(18, 6),
	"percent_from_high" numeric(10, 4),
	"distance_from_high_score" numeric(8, 4),
	"distance_from_high_score_percentile" numeric(8, 4),
	"rotation_score" numeric(8, 4),
	"rotation_score_delta_2w" numeric(8, 4),
	"rotation_rank" integer,
	"rank_delta_2w" integer,
	"signal" varchar(32),
	"signal_status" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_rotation_snapshot_scope_symbol_date_key" UNIQUE("rank_scope","symbol","date")
);
--> statement-breakpoint
CREATE INDEX "market_daily_price_symbol_date_idx" ON "market_daily_price" USING btree ("symbol","date");--> statement-breakpoint
CREATE INDEX "market_daily_price_date_idx" ON "market_daily_price" USING btree ("date");--> statement-breakpoint
CREATE INDEX "market_rotation_snapshot_run_scope_started_idx" ON "market_rotation_snapshot_run" USING btree ("rank_scope","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "market_rotation_snapshot_run_snapshot_date_idx" ON "market_rotation_snapshot_run" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "market_rotation_snapshot_scope_date_rank_idx" ON "market_rotation_snapshot" USING btree ("rank_scope","date","rotation_rank");--> statement-breakpoint
CREATE INDEX "market_rotation_snapshot_scope_date_idx" ON "market_rotation_snapshot" USING btree ("rank_scope","date");