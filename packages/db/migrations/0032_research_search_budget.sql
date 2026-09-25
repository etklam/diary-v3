CREATE TYPE "public"."research_search_reservation_status" AS ENUM('RESERVED', 'CONSUMED', 'UNKNOWN');--> statement-breakpoint
CREATE TABLE "research_search_budget" (
	"singleton" varchar(16) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"call_limit" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"consumed" integer DEFAULT 0 NOT NULL,
	"unknown" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_search_budget_limit_nonnegative" CHECK ("research_search_budget"."call_limit" >= 0),
	CONSTRAINT "research_search_budget_counts_nonnegative" CHECK ("research_search_budget"."reserved" >= 0 and "research_search_budget"."consumed" >= 0 and "research_search_budget"."unknown" >= 0),
	CONSTRAINT "research_search_budget_disabled_zero" CHECK ("research_search_budget"."enabled" or "research_search_budget"."call_limit" = 0)
);
--> statement-breakpoint
CREATE TABLE "research_search_reservation" (
	"reservation_id" varchar(36) PRIMARY KEY NOT NULL,
	"query_hash" varchar(64) NOT NULL,
	"status" "research_search_reservation_status" DEFAULT 'RESERVED' NOT NULL,
	"returned_results" integer DEFAULT 0 NOT NULL,
	"billed_credits" numeric(12, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "research_search_reservation_query_hash_shape" CHECK ("research_search_reservation"."query_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "research_search_reservation_results_nonnegative" CHECK ("research_search_reservation"."returned_results" >= 0),
	CONSTRAINT "research_search_reservation_credits_nonnegative" CHECK ("research_search_reservation"."billed_credits" is null or "research_search_reservation"."billed_credits" >= 0)
);
--> statement-breakpoint
CREATE INDEX "research_search_reservation_status_created_idx" ON "research_search_reservation" USING btree ("status","created_at");
--> statement-breakpoint
INSERT INTO "research_search_budget" ("singleton", "enabled", "call_limit", "reserved", "consumed", "unknown") VALUES ('default', false, 0, 0, 0, 0) ON CONFLICT ("singleton") DO NOTHING;
