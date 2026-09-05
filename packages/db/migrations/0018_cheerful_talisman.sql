CREATE TABLE "market_breadth_daily" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_breadth_daily_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"universe_key" varchar(32) NOT NULL,
	"date" date NOT NULL,
	"universe_count" integer NOT NULL,
	"up4_count" integer,
	"down4_count" integer,
	"up4_pct" numeric(8, 4),
	"down4_pct" numeric(8, 4),
	"above40d_count" integer,
	"above40d_pct" numeric(8, 4),
	"ratio_5d" numeric(12, 4),
	"ratio_10d" numeric(12, 4),
	"regime" varchar(32),
	"score" integer,
	"coverage_pct" numeric(5, 2),
	"is_stale" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_breadth_daily_universe_date_key" UNIQUE("universe_key","date"),
	CONSTRAINT "market_breadth_daily_universe_count_nonnegative" CHECK ("market_breadth_daily"."universe_count" >= 0),
	CONSTRAINT "market_breadth_daily_counts_nonnegative" CHECK (("market_breadth_daily"."up4_count" is null or "market_breadth_daily"."up4_count" >= 0) and ("market_breadth_daily"."down4_count" is null or "market_breadth_daily"."down4_count" >= 0) and ("market_breadth_daily"."above40d_count" is null or "market_breadth_daily"."above40d_count" >= 0)),
	CONSTRAINT "market_breadth_daily_percentages_bounded" CHECK (("market_breadth_daily"."up4_pct" is null or ("market_breadth_daily"."up4_pct" >= 0 and "market_breadth_daily"."up4_pct" <= 100)) and ("market_breadth_daily"."down4_pct" is null or ("market_breadth_daily"."down4_pct" >= 0 and "market_breadth_daily"."down4_pct" <= 100)) and ("market_breadth_daily"."above40d_pct" is null or ("market_breadth_daily"."above40d_pct" >= 0 and "market_breadth_daily"."above40d_pct" <= 100)) and ("market_breadth_daily"."coverage_pct" is null or ("market_breadth_daily"."coverage_pct" >= 0 and "market_breadth_daily"."coverage_pct" <= 100)))
);
--> statement-breakpoint
CREATE TABLE "market_universe" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_universe_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"symbol" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"exchange" varchar(32) NOT NULL,
	"asset_type" varchar(32) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sector" varchar(100),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_universe_symbol_key" UNIQUE("symbol"),
	CONSTRAINT "market_universe_symbol_canonical" CHECK ("market_universe"."symbol" = upper(btrim("market_universe"."symbol")) and length("market_universe"."symbol") > 0)
);
--> statement-breakpoint
CREATE INDEX "market_breadth_daily_universe_date_idx" ON "market_breadth_daily" USING btree ("universe_key","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "market_universe_symbol_idx" ON "market_universe" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "market_universe_active_asset_type_idx" ON "market_universe" USING btree ("is_active","asset_type");--> statement-breakpoint
CREATE INDEX "market_universe_exchange_active_idx" ON "market_universe" USING btree ("exchange","is_active");