CREATE TYPE "public"."research_dispatch_status" AS ENUM('NOT_SENT', 'DISPATCH_INTENT', 'SENT', 'SUCCEEDED', 'FAILED', 'OUTCOME_UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."research_execution_status" AS ENUM('CREATED', 'COLLECTING', 'DATA_READY', 'GENERATING', 'DRAFT_READY', 'BLOCKED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."research_method_status" AS ENUM('COMPLETE', 'INCOMPLETE', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."research_provider_status" AS ENUM('DRAFT', 'ACTIVE', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."research_qa_status" AS ENUM('NOT_CHECKED', 'PASS', 'WARN', 'FAIL', 'N_A');--> statement-breakpoint
CREATE TYPE "public"."research_quality" AS ENUM('FULL', 'LIMITED', 'STALE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."research_review_status" AS ENUM('DRAFT', 'CHANGES_REQUIRED', 'APPROVED');--> statement-breakpoint
CREATE TABLE "research_article_link" (
	"post_id" bigint PRIMARY KEY NOT NULL,
	"run_id" bigint NOT NULL,
	"revision_id" bigint NOT NULL,
	"body_hash" varchar(64) NOT NULL,
	"evidence_hash" varchar(64) NOT NULL,
	"reference_session" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_article_link_run_key" UNIQUE("run_id"),
	CONSTRAINT "research_article_link_revision_key" UNIQUE("revision_id"),
	CONSTRAINT "research_article_link_body_hash_shape" CHECK ("research_article_link"."body_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "research_article_link_evidence_hash_shape" CHECK ("research_article_link"."evidence_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "research_attempt" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "research_attempt_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" bigint NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"idempotency_key_hash" varchar(64) NOT NULL,
	"dispatch_status" "research_dispatch_status" DEFAULT 'DISPATCH_INTENT' NOT NULL,
	"lease_token" varchar(128),
	"worker_id" varchar(128),
	"provider_revision" integer,
	"model" varchar(200),
	"input_tokens" integer,
	"output_tokens" integer,
	"reserved_cost_cents" integer DEFAULT 0 NOT NULL,
	"estimated_cost_cents" integer,
	"diagnostics" varchar(4000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "research_attempt_run_idempotency_key" UNIQUE("run_id","idempotency_key_hash"),
	CONSTRAINT "research_attempt_hash_shape" CHECK ("research_attempt"."idempotency_key_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "research_attempt_cost_nonnegative" CHECK ("research_attempt"."reserved_cost_cents" >= 0 and ("research_attempt"."estimated_cost_cents" is null or "research_attempt"."estimated_cost_cents" >= 0))
);
--> statement-breakpoint
CREATE TABLE "research_budget_session" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "research_budget_session_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"budget_key" varchar(80) DEFAULT 'live-test' NOT NULL,
	"dispatch_limit" integer DEFAULT 3 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"consumed" integer DEFAULT 0 NOT NULL,
	"unknown" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_budget_session_key" UNIQUE("budget_key"),
	CONSTRAINT "research_budget_session_limit_nonnegative" CHECK ("research_budget_session"."dispatch_limit" >= 0),
	CONSTRAINT "research_budget_session_counts_nonnegative" CHECK ("research_budget_session"."reserved" >= 0 and "research_budget_session"."consumed" >= 0 and "research_budget_session"."unknown" >= 0)
);
--> statement-breakpoint
CREATE TABLE "research_evidence_snapshot" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "research_evidence_snapshot_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"manifest_json" text NOT NULL,
	"bars_json" text DEFAULT '[]' NOT NULL,
	"sources_json" text DEFAULT '[]' NOT NULL,
	"metrics_json" text DEFAULT '{}' NOT NULL,
	"candidates_json" text DEFAULT '{}' NOT NULL,
	"qa_json" text DEFAULT '[]' NOT NULL,
	"quality" "research_quality" DEFAULT 'LIMITED' NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_evidence_snapshot_run_version_key" UNIQUE("run_id","version"),
	CONSTRAINT "research_evidence_snapshot_run_hash_key" UNIQUE("run_id","content_hash"),
	CONSTRAINT "research_evidence_snapshot_version_positive" CHECK ("research_evidence_snapshot"."version" > 0),
	CONSTRAINT "research_evidence_snapshot_hash_shape" CHECK ("research_evidence_snapshot"."content_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "research_instrument_profile" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "research_instrument_profile_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"method_profile_id" bigint NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"exchange" varchar(32) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"asset_type" varchar(16) NOT NULL,
	"benchmarks_json" text DEFAULT '[]' NOT NULL,
	"peers_json" text DEFAULT '[]' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_instrument_profile_method_symbol_key" UNIQUE("method_profile_id","symbol"),
	CONSTRAINT "research_instrument_profile_symbol_shape" CHECK ("research_instrument_profile"."symbol" = upper(btrim("research_instrument_profile"."symbol")) and "research_instrument_profile"."symbol" ~ '^[A-Z0-9.\-]{1,20}$'),
	CONSTRAINT "research_instrument_profile_currency_shape" CHECK ("research_instrument_profile"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "research_instrument_profile_asset_type" CHECK ("research_instrument_profile"."asset_type" in ('EQUITY', 'ETF')),
	CONSTRAINT "research_instrument_profile_hash_shape" CHECK ("research_instrument_profile"."config_hash" is null or "research_instrument_profile"."config_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "research_method_profile" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "research_method_profile_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"method_key" varchar(80) NOT NULL,
	"version" varchar(32) NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" "research_method_status" DEFAULT 'INCOMPLETE' NOT NULL,
	"source_uri" varchar(500),
	"bundle_hash" varchar(64),
	"requirements_json" text DEFAULT '{}' NOT NULL,
	"coverage_manifest_json" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_method_profile_key" UNIQUE("method_key","version"),
	CONSTRAINT "research_method_profile_key_shape" CHECK ("research_method_profile"."method_key" ~ '^[a-z][a-z0-9-]{2,80}$'),
	CONSTRAINT "research_method_profile_version_shape" CHECK ("research_method_profile"."version" ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
	CONSTRAINT "research_method_profile_hash_shape" CHECK ("research_method_profile"."bundle_hash" is null or "research_method_profile"."bundle_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "research_provider_config" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "research_provider_config_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"revision" integer NOT NULL,
	"status" "research_provider_status" DEFAULT 'DRAFT' NOT NULL,
	"provider" varchar(40) DEFAULT 'openrouter' NOT NULL,
	"protocol" varchar(40) DEFAULT 'chat_completions' NOT NULL,
	"base_url" varchar(500) DEFAULT 'https://openrouter.ai/api/v1' NOT NULL,
	"model" varchar(200) DEFAULT 'openrouter/free' NOT NULL,
	"max_input_tokens" integer DEFAULT 16000 NOT NULL,
	"max_output_tokens" integer DEFAULT 6000 NOT NULL,
	"timeout_ms" integer DEFAULT 120000 NOT NULL,
	"secret_ref" varchar(255),
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_provider_config_revision_key" UNIQUE("revision"),
	CONSTRAINT "research_provider_config_provider" CHECK ("research_provider_config"."provider" = 'openrouter'),
	CONSTRAINT "research_provider_config_protocol" CHECK ("research_provider_config"."protocol" = 'chat_completions'),
	CONSTRAINT "research_provider_config_model" CHECK ("research_provider_config"."model" = 'openrouter/free'),
	CONSTRAINT "research_provider_config_base_url_https" CHECK ("research_provider_config"."base_url" like 'https://%'),
	CONSTRAINT "research_provider_config_bounds" CHECK ("research_provider_config"."max_input_tokens" > 0 and "research_provider_config"."max_output_tokens" > 0 and "research_provider_config"."timeout_ms" between 1000 and 300000)
);
--> statement-breakpoint
CREATE TABLE "research_revision" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "research_revision_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" bigint NOT NULL,
	"revision" integer NOT NULL,
	"parent_revision" integer,
	"structured_json" text NOT NULL,
	"content" text NOT NULL,
	"body_hash" varchar(64) NOT NULL,
	"qa_status" "research_qa_status" DEFAULT 'NOT_CHECKED' NOT NULL,
	"review_status" "research_review_status" DEFAULT 'DRAFT' NOT NULL,
	"approved_by" bigint,
	"approved_at" timestamp with time zone,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_revision_run_number_key" UNIQUE("run_id","revision"),
	CONSTRAINT "research_revision_run_hash_key" UNIQUE("run_id","body_hash"),
	CONSTRAINT "research_revision_positive" CHECK ("research_revision"."revision" > 0),
	CONSTRAINT "research_revision_parent_valid" CHECK ("research_revision"."parent_revision" is null or "research_revision"."parent_revision" > 0),
	CONSTRAINT "research_revision_hash_shape" CHECK ("research_revision"."body_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "research_revision_approval_fields" CHECK ("research_revision"."review_status" <> 'APPROVED' or ("research_revision"."approved_by" is not null and "research_revision"."approved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "research_run" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "research_run_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"requester_id" bigint NOT NULL,
	"method_profile_id" bigint NOT NULL,
	"instrument_profile_id" bigint NOT NULL,
	"execution_status" "research_execution_status" DEFAULT 'CREATED' NOT NULL,
	"dispatch_status" "research_dispatch_status" DEFAULT 'NOT_SENT' NOT NULL,
	"quality" "research_quality" DEFAULT 'LIMITED' NOT NULL,
	"review_status" "research_review_status" DEFAULT 'DRAFT' NOT NULL,
	"reference_session" date,
	"as_of" timestamp with time zone,
	"display_timezone" varchar(50) DEFAULT 'Asia/Hong_Kong' NOT NULL,
	"exchange_timezone" varchar(50) DEFAULT 'America/New_York' NOT NULL,
	"profile_snapshot_json" text DEFAULT '{}' NOT NULL,
	"evidence_hash" varchar(64),
	"current_revision" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"linked_post_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_run_linked_post_key" UNIQUE("linked_post_id"),
	CONSTRAINT "research_run_revision_nonnegative" CHECK ("research_run"."current_revision" >= 0),
	CONSTRAINT "research_run_version_positive" CHECK ("research_run"."version" > 0),
	CONSTRAINT "research_run_hash_shape" CHECK ("research_run"."evidence_hash" is null or "research_run"."evidence_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "research_runtime_state" (
	"singleton" varchar(16) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"feature_enabled" boolean DEFAULT false NOT NULL,
	"generation_enabled" boolean DEFAULT false NOT NULL,
	"worker_id" varchar(128),
	"worker_heartbeat_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_article_link" ADD CONSTRAINT "research_article_link_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_article_link" ADD CONSTRAINT "research_article_link_run_id_research_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_run"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_article_link" ADD CONSTRAINT "research_article_link_revision_id_research_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."research_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_attempt" ADD CONSTRAINT "research_attempt_run_id_research_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_evidence_snapshot" ADD CONSTRAINT "research_evidence_snapshot_run_id_research_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_instrument_profile" ADD CONSTRAINT "research_instrument_profile_method_profile_id_research_method_profile_id_fk" FOREIGN KEY ("method_profile_id") REFERENCES "public"."research_method_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_provider_config" ADD CONSTRAINT "research_provider_config_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_revision" ADD CONSTRAINT "research_revision_run_id_research_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_revision" ADD CONSTRAINT "research_revision_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_revision" ADD CONSTRAINT "research_revision_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run" ADD CONSTRAINT "research_run_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run" ADD CONSTRAINT "research_run_method_profile_id_research_method_profile_id_fk" FOREIGN KEY ("method_profile_id") REFERENCES "public"."research_method_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run" ADD CONSTRAINT "research_run_instrument_profile_id_research_instrument_profile_id_fk" FOREIGN KEY ("instrument_profile_id") REFERENCES "public"."research_instrument_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run" ADD CONSTRAINT "research_run_linked_post_id_posts_id_fk" FOREIGN KEY ("linked_post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_attempt_run_created_idx" ON "research_attempt" USING btree ("run_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "research_attempt_dispatch_idx" ON "research_attempt" USING btree ("dispatch_status","created_at","id");--> statement-breakpoint
CREATE INDEX "research_evidence_snapshot_run_created_idx" ON "research_evidence_snapshot" USING btree ("run_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "research_instrument_profile_symbol_idx" ON "research_instrument_profile" USING btree ("symbol","enabled");--> statement-breakpoint
CREATE INDEX "research_provider_config_status_idx" ON "research_provider_config" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "research_revision_run_created_idx" ON "research_revision" USING btree ("run_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "research_run_status_updated_idx" ON "research_run" USING btree ("execution_status","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "research_run_instrument_session_idx" ON "research_run" USING btree ("instrument_profile_id","reference_session" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
INSERT INTO "research_runtime_state" ("singleton", "feature_enabled", "generation_enabled")
VALUES ('default', false, false)
ON CONFLICT ("singleton") DO NOTHING;--> statement-breakpoint
INSERT INTO "research_budget_session" ("budget_key", "dispatch_limit", "reserved", "consumed", "unknown")
VALUES ('live-test', 3, 0, 0, 0)
ON CONFLICT ("budget_key") DO NOTHING;--> statement-breakpoint
INSERT INTO "research_method_profile" (
  "method_key", "version", "title", "status", "source_uri", "bundle_hash", "requirements_json", "coverage_manifest_json"
)
VALUES (
  'us-equity-swing-report',
  '1.0.0',
  'Evidence-first US equity swing reports',
  'INCOMPLETE',
  'https://app.notion.com/p/3e5304d06c3c81e1b856e4f4b6afc8a7',
  'b45697fb82435cfc4c45961620be209ab8ebe59f558e36c02bcda380eff6206d',
  '{"targetSessions":400,"minimumCloses":260,"minimumCompleteOhlc":150,"minimumVolumeRows":21,"minimumCompletedWeeks":34}',
  '{"main":true,"appendices":7,"calculator":false,"templates":false,"originalTests":false,"complete":false}'
)
ON CONFLICT ("method_key", "version") DO NOTHING;--> statement-breakpoint
INSERT INTO "research_instrument_profile" (
  "method_profile_id", "symbol", "name", "exchange", "currency", "asset_type", "benchmarks_json", "peers_json", "enabled", "config_hash"
)
SELECT "id", 'SOXX', 'iShares Semiconductor ETF', 'NASDAQ', 'USD', 'ETF', '["SPY","QQQ","SMH"]', '["NVDA","AMD","MU","INTC","AVGO","TSM","ASML"]', true, NULL
FROM "research_method_profile" WHERE "method_key" = 'us-equity-swing-report' AND "version" = '1.0.0'
ON CONFLICT ("method_profile_id", "symbol") DO NOTHING;--> statement-breakpoint
INSERT INTO "research_instrument_profile" (
  "method_profile_id", "symbol", "name", "exchange", "currency", "asset_type", "benchmarks_json", "peers_json", "enabled", "config_hash"
)
SELECT "id", 'QQQ', 'Invesco QQQ Trust', 'NASDAQ', 'USD', 'ETF', '["SPY"]', '["XLK","VGT"]', true, NULL
FROM "research_method_profile" WHERE "method_key" = 'us-equity-swing-report' AND "version" = '1.0.0'
ON CONFLICT ("method_profile_id", "symbol") DO NOTHING;
