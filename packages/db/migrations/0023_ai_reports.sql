CREATE TYPE "public"."ai_attempt_status" AS ENUM('reserved', 'dispatched', 'succeeded', 'failed', 'cancelled', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ai_config_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_protocol" AS ENUM('chat_completions');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_type" AS ENUM('deepseek');--> statement-breakpoint
CREATE TYPE "public"."ai_report_source_state" AS ENUM('current', 'changed', 'invalidated');--> statement-breakpoint
CREATE TYPE "public"."ai_report_source_type" AS ENUM('diary', 'transaction', 'discipline', 'holding');--> statement-breakpoint
CREATE TYPE "public"."ai_report_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_report_type" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."ai_thinking" AS ENUM('enabled', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."ai_usage_scope" AS ENUM('user', 'global');--> statement-breakpoint
CREATE TABLE "ai_admin_audit_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_admin_audit_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" bigint NOT NULL,
	"action" varchar(80) NOT NULL,
	"target_type" varchar(80) NOT NULL,
	"target_id" varchar(100),
	"summary" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_version" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_prompt_version_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"report_type" "ai_report_type" NOT NULL,
	"revision" integer NOT NULL,
	"template" text NOT NULL,
	"status" "ai_config_status" DEFAULT 'draft' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "ai_prompt_version_type_revision_key" UNIQUE("report_type","revision"),
	CONSTRAINT "ai_prompt_version_template_nonempty" CHECK (length(btrim("ai_prompt_version"."template")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ai_provider_config_version" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_provider_config_version_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"revision" integer NOT NULL,
	"status" "ai_config_status" DEFAULT 'draft' NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"provider_type" "ai_provider_type" DEFAULT 'deepseek' NOT NULL,
	"protocol" "ai_provider_protocol" DEFAULT 'chat_completions' NOT NULL,
	"base_url" varchar(500) NOT NULL,
	"model" varchar(200) NOT NULL,
	"thinking" "ai_thinking" DEFAULT 'disabled' NOT NULL,
	"max_input_tokens" integer DEFAULT 32000 NOT NULL,
	"max_output_tokens" integer DEFAULT 4000 NOT NULL,
	"timeout_ms" integer DEFAULT 120000 NOT NULL,
	"monthly_budget_cents" integer DEFAULT 0 NOT NULL,
	"encrypted_api_key" text,
	"secret_key_version" integer,
	"recipient_revision" integer DEFAULT 1 NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_status" varchar(16),
	"created_by" bigint,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_config_revision_key" UNIQUE("revision"),
	CONSTRAINT "ai_provider_config_max_input_positive" CHECK ("ai_provider_config_version"."max_input_tokens" > 0),
	CONSTRAINT "ai_provider_config_max_output_positive" CHECK ("ai_provider_config_version"."max_output_tokens" > 0),
	CONSTRAINT "ai_provider_config_timeout_bounds" CHECK ("ai_provider_config_version"."timeout_ms" between 1000 and 300000),
	CONSTRAINT "ai_provider_config_budget_nonnegative" CHECK ("ai_provider_config_version"."monthly_budget_cents" >= 0),
	CONSTRAINT "ai_provider_config_base_url_https" CHECK ("ai_provider_config_version"."base_url" like 'https://%')
);
--> statement-breakpoint
CREATE TABLE "ai_report_attempt" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_report_attempt_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"report_id" bigint,
	"user_id" bigint NOT NULL,
	"status" "ai_attempt_status" DEFAULT 'reserved' NOT NULL,
	"provider_request_id" varchar(200),
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_hit_tokens" integer,
	"cache_miss_tokens" integer,
	"estimated_cost_cents" integer,
	"pricing_version" varchar(80),
	"error_code" varchar(80),
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_report_source" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_report_source_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"report_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"alias" varchar(16) NOT NULL,
	"source_type" "ai_report_source_type" NOT NULL,
	"source_id" varchar(80) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"dependency" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_report_sources_report_alias_key" UNIQUE("report_id","alias")
);
--> statement-breakpoint
CREATE TABLE "ai_report" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_report_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"report_type" "ai_report_type" NOT NULL,
	"period_start" date NOT NULL,
	"period_end_exclusive" date NOT NULL,
	"timezone" varchar(50) NOT NULL,
	"locale" varchar(5) NOT NULL,
	"revision" integer NOT NULL,
	"status" "ai_report_status" DEFAULT 'queued' NOT NULL,
	"source_state" "ai_report_source_state" DEFAULT 'current' NOT NULL,
	"is_partial_period" boolean DEFAULT false NOT NULL,
	"lease_token" varchar(128),
	"worker_id" varchar(128),
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"input_snapshot_encrypted" text,
	"input_snapshot_hash" varchar(64) NOT NULL,
	"coverage_json" text NOT NULL,
	"metrics_json" text NOT NULL,
	"analysis_json" text,
	"model" varchar(200),
	"provider_config_version_id" bigint,
	"prompt_version_id" bigint,
	"recipient_revision" integer NOT NULL,
	"schema_version" varchar(40) DEFAULT 'ai-analysis-v1' NOT NULL,
	"idempotency_key_hash" varchar(64) NOT NULL,
	"normalized_request_hash" varchar(64) NOT NULL,
	"regenerated_from_report_id" bigint,
	"error_code" varchar(80),
	"source_invalidated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_reports_id_user_key" UNIQUE("id","user_id"),
	CONSTRAINT "ai_reports_user_idempotency_key" UNIQUE("user_id","idempotency_key_hash"),
	CONSTRAINT "ai_reports_period_revision_key" UNIQUE("user_id","report_type","period_start","timezone","locale","revision"),
	CONSTRAINT "ai_reports_revision_positive" CHECK ("ai_report"."revision" > 0),
	CONSTRAINT "ai_reports_period_order" CHECK ("ai_report"."period_end_exclusive" > "ai_report"."period_start"),
	CONSTRAINT "ai_reports_locale_valid" CHECK ("ai_report"."locale" in ('zh-TW', 'zh-CN', 'en')),
	CONSTRAINT "ai_reports_terminal_fields" CHECK (("ai_report"."status" in ('queued', 'running') and "ai_report"."finished_at" is null) or ("ai_report"."status" in ('succeeded', 'failed', 'cancelled') and "ai_report"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "ai_runtime_state" (
	"singleton" varchar(16) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"generation_enabled" boolean DEFAULT false NOT NULL,
	"active_provider_config_id" bigint,
	"active_weekly_prompt_id" bigint,
	"active_monthly_prompt_id" bigint,
	"worker_id" varchar(128),
	"worker_heartbeat_at" timestamp with time zone,
	"deployment_epoch" varchar(64),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_bucket" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_usage_bucket_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"scope" "ai_usage_scope" NOT NULL,
	"user_id" bigint,
	"bucket_month" date NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"consumed" integer DEFAULT 0 NOT NULL,
	"released" integer DEFAULT 0 NOT NULL,
	"unknown" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_cents" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_bucket_scope_month_key" UNIQUE("scope","user_id","bucket_month"),
	CONSTRAINT "ai_usage_bucket_counts_nonnegative" CHECK ("ai_usage_bucket"."reserved" >= 0 and "ai_usage_bucket"."consumed" >= 0 and "ai_usage_bucket"."released" >= 0 and "ai_usage_bucket"."unknown" >= 0),
	CONSTRAINT "ai_usage_bucket_scope_owner_check" CHECK (("ai_usage_bucket"."scope" = 'global' and "ai_usage_bucket"."user_id" is null) or ("ai_usage_bucket"."scope" = 'user' and "ai_usage_bucket"."user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "ai_user_access" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"monthly_quota" integer DEFAULT 10 NOT NULL,
	"granted_by" bigint,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_user_access_quota_nonnegative" CHECK ("ai_user_access"."monthly_quota" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_user_consent" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"recipient_revision" integer NOT NULL,
	"disclosure_version" varchar(80) NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_user_consent_revision_positive" CHECK ("ai_user_consent"."recipient_revision" > 0),
	CONSTRAINT "ai_user_consent_state_check" CHECK (("ai_user_consent"."accepted_at" is not null) or ("ai_user_consent"."revoked_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "ai_admin_audit_event" ADD CONSTRAINT "ai_admin_audit_event_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_version" ADD CONSTRAINT "ai_prompt_version_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_config_version" ADD CONSTRAINT "ai_provider_config_version_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_report_attempt" ADD CONSTRAINT "ai_report_attempt_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_report_attempt" ADD CONSTRAINT "ai_report_attempt_report_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."ai_report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_report_source" ADD CONSTRAINT "ai_report_source_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_report_source" ADD CONSTRAINT "ai_report_sources_report_owner_fkey" FOREIGN KEY ("report_id","user_id") REFERENCES "public"."ai_report"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_report_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_report_provider_config_version_id_ai_provider_config_version_id_fk" FOREIGN KEY ("provider_config_version_id") REFERENCES "public"."ai_provider_config_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_report_prompt_version_id_ai_prompt_version_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."ai_prompt_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_report_regenerated_from_report_id_ai_report_id_fk" FOREIGN KEY ("regenerated_from_report_id") REFERENCES "public"."ai_report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runtime_state" ADD CONSTRAINT "ai_runtime_state_active_provider_config_id_ai_provider_config_version_id_fk" FOREIGN KEY ("active_provider_config_id") REFERENCES "public"."ai_provider_config_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runtime_state" ADD CONSTRAINT "ai_runtime_state_active_weekly_prompt_id_ai_prompt_version_id_fk" FOREIGN KEY ("active_weekly_prompt_id") REFERENCES "public"."ai_prompt_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runtime_state" ADD CONSTRAINT "ai_runtime_state_active_monthly_prompt_id_ai_prompt_version_id_fk" FOREIGN KEY ("active_monthly_prompt_id") REFERENCES "public"."ai_prompt_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_bucket" ADD CONSTRAINT "ai_usage_bucket_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_user_access" ADD CONSTRAINT "ai_user_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_user_access" ADD CONSTRAINT "ai_user_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_user_consent" ADD CONSTRAINT "ai_user_consent_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_admin_audit_created_idx" ON "ai_admin_audit_event" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_admin_audit_target_idx" ON "ai_admin_audit_event" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "ai_prompt_version_type_status_idx" ON "ai_prompt_version" USING btree ("report_type","status","id");--> statement-breakpoint
CREATE INDEX "ai_provider_config_status_idx" ON "ai_provider_config_version" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "ai_report_attempt_report_idx" ON "ai_report_attempt" USING btree ("report_id","id");--> statement-breakpoint
CREATE INDEX "ai_report_attempt_user_idx" ON "ai_report_attempt" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_report_sources_owner_source_idx" ON "ai_report_source" USING btree ("user_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "ai_report_sources_report_idx" ON "ai_report_source" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "ai_reports_user_created_idx" ON "ai_report" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_reports_user_period_idx" ON "ai_report" USING btree ("user_id","report_type","period_start" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_reports_job_claim_idx" ON "ai_report" USING btree ("status","lease_expires_at","queued_at","id");--> statement-breakpoint
CREATE INDEX "ai_reports_input_hash_idx" ON "ai_report" USING btree ("user_id","input_snapshot_hash");--> statement-breakpoint
CREATE INDEX "ai_user_access_enabled_idx" ON "ai_user_access" USING btree ("enabled","user_id");
--> statement-breakpoint
ALTER TABLE "ai_admin_audit_event" ALTER COLUMN "actor_user_id" DROP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_reports_one_active_job_key"
  ON "ai_report" ("user_id")
  WHERE "status" IN ('queued', 'running') AND "deleted_at" IS NULL;
--> statement-breakpoint
INSERT INTO "ai_runtime_state" ("singleton", "generation_enabled") VALUES ('default', false) ON CONFLICT ("singleton") DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ai_mark_reports_changed(p_user_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(7441, hashtext(p_user_id::text));
  INSERT INTO "ai_user_access" ("user_id", "data_revision") VALUES (p_user_id, 1)
  ON CONFLICT ("user_id") DO UPDATE SET "data_revision" = "ai_user_access"."data_revision" + 1, "updated_at" = now();
  UPDATE "ai_report"
  SET "source_state" = CASE WHEN "source_state" = 'invalidated' THEN "source_state" ELSE 'changed' END,
      "updated_at" = now()
  WHERE "user_id" = p_user_id AND "deleted_at" IS NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ai_invalidate_reports_for_source()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source_kind text := TG_ARGV[0];
BEGIN
  PERFORM pg_advisory_xact_lock(7441, hashtext(OLD.user_id::text));
  INSERT INTO "ai_user_access" ("user_id", "data_revision") VALUES (OLD.user_id, 1)
  ON CONFLICT ("user_id") DO UPDATE SET "data_revision" = "ai_user_access"."data_revision" + 1, "updated_at" = now();
  UPDATE "ai_usage_bucket" b
  SET "reserved" = greatest(0, b."reserved" - 1), "released" = b."released" + 1, "updated_at" = now()
  WHERE b."scope" = 'user' AND b."user_id" = OLD.user_id
    AND EXISTS (
      SELECT 1 FROM "ai_report" r
      WHERE r."user_id" = OLD.user_id
        AND r."status" IN ('queued', 'running')
        AND r."dispatched_at" IS NULL
        AND r."deleted_at" IS NULL
        AND EXISTS (
          SELECT 1 FROM "ai_report_source" s
          WHERE s."report_id" = r."id" AND s."user_id" = r."user_id"
            AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text
        )
    );
  UPDATE "ai_report" r
  SET "source_state" = 'invalidated',
      "status" = CASE WHEN r."status" IN ('queued', 'running') THEN 'cancelled'::ai_report_status ELSE r."status" END,
      "error_code" = CASE WHEN r."status" IN ('queued', 'running') THEN 'AI_SOURCE_INVALIDATED' ELSE r."error_code" END,
      "source_invalidated_at" = now(),
      "analysis_json" = NULL,
      "metrics_json" = '[]',
      "coverage_json" = '{"diaries":{"count":0,"available":false},"transactions":{"count":0,"available":false},"holdings":{"count":0,"available":false},"disciplines":{"count":0,"available":false},"notes":["Source invalidated"]}',
      "input_snapshot_encrypted" = NULL,
      "finished_at" = CASE WHEN r."status" IN ('queued', 'running') THEN now() ELSE r."finished_at" END,
      "updated_at" = now()
  WHERE r."user_id" = OLD.user_id
    AND r."deleted_at" IS NULL
    AND EXISTS (
      SELECT 1 FROM "ai_report_source" s
      WHERE s."report_id" = r."id"
        AND s."user_id" = r."user_id"
        AND s."source_type" = source_kind::ai_report_source_type
        AND s."source_id" = OLD.id::text
    );
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ai_mark_reports_changed_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ai_mark_reports_changed(NEW.user_id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER diaries_ai_reports_changed
AFTER INSERT OR UPDATE ON "diaries"
FOR EACH ROW EXECUTE FUNCTION ai_mark_reports_changed_trigger();
--> statement-breakpoint
CREATE TRIGGER transactions_ai_reports_changed
AFTER INSERT OR UPDATE ON "transactions"
FOR EACH ROW EXECUTE FUNCTION ai_mark_reports_changed_trigger();
--> statement-breakpoint
CREATE TRIGGER disciplines_ai_reports_changed
AFTER INSERT OR UPDATE ON "disciplines"
FOR EACH ROW EXECUTE FUNCTION ai_mark_reports_changed_trigger();
--> statement-breakpoint
CREATE TRIGGER diaries_ai_reports_invalidated
AFTER DELETE ON "diaries"
FOR EACH ROW EXECUTE FUNCTION ai_invalidate_reports_for_source('diary');
--> statement-breakpoint
CREATE TRIGGER transactions_ai_reports_invalidated
AFTER DELETE ON "transactions"
FOR EACH ROW EXECUTE FUNCTION ai_invalidate_reports_for_source('transaction');
--> statement-breakpoint
CREATE TRIGGER disciplines_ai_reports_invalidated
AFTER DELETE ON "disciplines"
FOR EACH ROW EXECUTE FUNCTION ai_invalidate_reports_for_source('discipline');
--> statement-breakpoint
ALTER TABLE "ai_report" ADD COLUMN "captured_data_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_user_access" ADD COLUMN "data_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_report_source" ADD CONSTRAINT "ai_report_sources_report_source_key" UNIQUE("report_id","source_type","source_id");
--> statement-breakpoint
ALTER TABLE "ai_provider_config_version" ADD COLUMN "recipient_name" varchar(200) DEFAULT 'DeepSeek' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_provider_config_version" ADD COLUMN "disclosure_version" varchar(80) DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_provider_config_version" ADD COLUMN "pricing_currency" varchar(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_provider_config_version" ADD COLUMN "pricing_version" varchar(80);--> statement-breakpoint
ALTER TABLE "ai_provider_config_version" ADD COLUMN "input_price_per_million_cents" integer;--> statement-breakpoint
ALTER TABLE "ai_provider_config_version" ADD COLUMN "output_price_per_million_cents" integer;--> statement-breakpoint
ALTER TABLE "ai_provider_config_version" ADD COLUMN "reservation_cost_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_provider_config_version" ADD COLUMN "disclosure_text" text DEFAULT 'Your saved journal records will be processed by the configured AI provider to create a private review report.' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_report" ADD COLUMN "snapshot_captured_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_usage_bucket" ADD COLUMN "reserved_cost_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE "ai_report_request" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_report_request_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"idempotency_key_hash" varchar(64) NOT NULL,
	"normalized_request_hash" varchar(64) NOT NULL,
	"report_id" bigint,
	"tombstone_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_report_request_owner_key" UNIQUE("user_id","idempotency_key_hash")
);
--> statement-breakpoint
ALTER TABLE "ai_report_request" ADD CONSTRAINT "ai_report_request_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_report_request" ADD CONSTRAINT "ai_report_request_report_id_ai_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."ai_report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_report_request_report_idx" ON "ai_report_request" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "ai_report_request_tombstone_idx" ON "ai_report_request" USING btree ("tombstone_until");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_global_month_key" ON "ai_usage_bucket" USING btree ("bucket_month") WHERE "ai_usage_bucket"."scope" = 'global';--> statement-breakpoint
ALTER TABLE "ai_usage_bucket" ADD CONSTRAINT "ai_usage_costs_nonnegative" CHECK ("ai_usage_bucket"."reserved_cost_cents" >= 0 and coalesce("ai_usage_bucket"."estimated_cost_cents", 0) >= 0);
--> statement-breakpoint
ALTER TABLE "ai_report_attempt" ADD COLUMN "reservation_bucket_month" date DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_report_attempt" ADD COLUMN "reservation_cost_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_report" ADD COLUMN "reservation_bucket_month" date DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_report" ADD COLUMN "reservation_cost_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Reinstall source invalidation after the reservation columns exist. The
-- earlier function remains valid for historical migrations before AI budget
-- accounting was introduced.
CREATE OR REPLACE FUNCTION ai_invalidate_reports_for_source()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source_kind text := TG_ARGV[0];
BEGIN
  PERFORM pg_advisory_xact_lock(7441, hashtext(OLD.user_id::text));
  INSERT INTO "ai_user_access" ("user_id", "data_revision") VALUES (OLD.user_id, 1)
  ON CONFLICT ("user_id") DO UPDATE SET "data_revision" = "ai_user_access"."data_revision" + 1, "updated_at" = now();
  UPDATE "ai_usage_bucket" b
  SET "reserved" = greatest(0, b."reserved" - 1), "released" = b."released" + 1, "updated_at" = now()
  WHERE b."scope" = 'user' AND b."user_id" = OLD.user_id
    AND EXISTS (
      SELECT 1 FROM "ai_report" r
      WHERE r."user_id" = OLD.user_id AND r."status" IN ('queued', 'running')
        AND r."dispatched_at" IS NULL AND r."deleted_at" IS NULL
        AND EXISTS (SELECT 1 FROM "ai_report_source" s WHERE s."report_id" = r."id" AND s."user_id" = r."user_id" AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text)
    );
  UPDATE "ai_usage_bucket" b
  SET "reserved" = greatest(0, b."reserved" - 1),
      "reserved_cost_cents" = greatest(0, b."reserved_cost_cents" - COALESCE((
        SELECT r."reservation_cost_cents" FROM "ai_report" r
        WHERE r."user_id" = OLD.user_id AND r."status" IN ('queued', 'running')
          AND r."dispatched_at" IS NULL AND r."deleted_at" IS NULL AND r."reservation_cost_cents" > 0
          AND r."reservation_bucket_month" = b."bucket_month"
          AND EXISTS (SELECT 1 FROM "ai_report_source" s WHERE s."report_id" = r."id" AND s."user_id" = r."user_id" AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text)
        LIMIT 1
      ), 0)),
      "released" = b."released" + 1, "updated_at" = now()
  WHERE b."scope" = 'global' AND b."user_id" IS NULL
    AND EXISTS (
      SELECT 1 FROM "ai_report" r
      WHERE r."user_id" = OLD.user_id AND r."status" IN ('queued', 'running')
        AND r."dispatched_at" IS NULL AND r."deleted_at" IS NULL AND r."reservation_cost_cents" > 0
        AND r."reservation_bucket_month" = b."bucket_month"
        AND EXISTS (SELECT 1 FROM "ai_report_source" s WHERE s."report_id" = r."id" AND s."user_id" = r."user_id" AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text)
    );
  UPDATE "ai_report" r
  SET "source_state" = 'invalidated',
      "status" = CASE WHEN r."status" IN ('queued', 'running') THEN 'cancelled'::ai_report_status ELSE r."status" END,
      "error_code" = CASE WHEN r."status" IN ('queued', 'running') THEN 'AI_SOURCE_INVALIDATED' ELSE r."error_code" END,
      "source_invalidated_at" = now(), "analysis_json" = NULL, "metrics_json" = '[]',
      "coverage_json" = '{"diaries":{"count":0,"available":false},"transactions":{"count":0,"available":false},"holdings":{"count":0,"available":false},"disciplines":{"count":0,"available":false},"notes":["Source invalidated"]}',
      "input_snapshot_encrypted" = NULL,
      "finished_at" = CASE WHEN r."status" IN ('queued', 'running') THEN now() ELSE r."finished_at" END,
      "updated_at" = now()
  WHERE r."user_id" = OLD.user_id AND r."deleted_at" IS NULL
    AND EXISTS (SELECT 1 FROM "ai_report_source" s WHERE s."report_id" = r."id" AND s."user_id" = r."user_id" AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text);
  RETURN OLD;
END;
$$;
--> statement-breakpoint
ALTER TABLE "ai_report_attempt" ADD COLUMN "pricing_currency" varchar(3);
--> statement-breakpoint
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_reports_queued_fields" CHECK ("ai_report"."status" <> 'queued' or ("ai_report"."started_at" is null and "ai_report"."dispatched_at" is null and "ai_report"."lease_token" is null and "ai_report"."worker_id" is null and "ai_report"."lease_expires_at" is null));--> statement-breakpoint
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_reports_running_fields" CHECK ("ai_report"."status" <> 'running' or ("ai_report"."started_at" is not null and "ai_report"."lease_token" is not null and "ai_report"."worker_id" is not null and "ai_report"."lease_expires_at" is not null));--> statement-breakpoint
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_reports_succeeded_analysis" CHECK ("ai_report"."status" <> 'succeeded' or "ai_report"."deleted_at" is not null or "ai_report"."source_state" = 'invalidated' or "ai_report"."analysis_json" is not null);--> statement-breakpoint
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_reports_invalidated_body" CHECK ("ai_report"."source_state" <> 'invalidated' or ("ai_report"."input_snapshot_encrypted" is null and "ai_report"."analysis_json" is null and "ai_report"."metrics_json" = '[]'));--> statement-breakpoint
ALTER TABLE "ai_report" ADD CONSTRAINT "ai_reports_reservation_nonnegative" CHECK ("ai_report"."reservation_cost_cents" >= 0);
--> statement-breakpoint
ALTER TABLE "ai_report_attempt" ADD COLUMN "provider_config_version_id" bigint;--> statement-breakpoint
ALTER TABLE "ai_report_attempt" ADD COLUMN "model" varchar(200);--> statement-breakpoint
ALTER TABLE "ai_report_attempt" ADD CONSTRAINT "ai_report_attempt_provider_config_version_id_ai_provider_config_version_id_fk" FOREIGN KEY ("provider_config_version_id") REFERENCES "public"."ai_provider_config_version"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Source invalidation is kept in the database so direct deletes and updates
-- cannot bypass report fencing, quota release, or provider-outcome accounting.
CREATE OR REPLACE FUNCTION ai_invalidate_reports_for_source()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source_kind text := TG_ARGV[0];
  attempt_row record;
BEGIN
  PERFORM pg_advisory_xact_lock(7441, hashtext(OLD.user_id::text));
  -- Cascading account deletion removes the parent first from the trigger's
  -- point of view. Never recreate an access row for a deleted account.
  IF EXISTS (SELECT 1 FROM "users" WHERE "id" = OLD.user_id) THEN
    INSERT INTO "ai_user_access" ("user_id", "data_revision") VALUES (OLD.user_id, 1)
    ON CONFLICT ("user_id") DO UPDATE SET "data_revision" = "ai_user_access"."data_revision" + 1, "updated_at" = now();
  END IF;

  -- A dispatched request has already consumed its conservative global bound.
  -- Fence it exactly once and account the provider outcome as unknown before
  -- invalidating the report. This also prevents a late completion from being
  -- interpreted as a successful report.
  FOR attempt_row IN
    SELECT a.id, a.user_id, a.reservation_bucket_month, a.reservation_cost_cents
    FROM "ai_report_attempt" a
    JOIN "ai_report" r ON r.id = a.report_id
    WHERE r."user_id" = OLD.user_id
      AND r."deleted_at" IS NULL
      AND r."source_state" <> 'invalidated'
      AND r."status" IN ('queued', 'running')
      AND r."dispatched_at" IS NOT NULL
      AND a."status" = 'dispatched'
      AND EXISTS (
        SELECT 1 FROM "ai_report_source" s
        WHERE s."report_id" = r."id" AND s."user_id" = r."user_id"
          AND s."source_type" = source_kind::ai_report_source_type
          AND s."source_id" = OLD.id::text
      )
  LOOP
    UPDATE "ai_report_attempt"
    SET "status" = 'unknown', "error_code" = 'AI_SOURCE_INVALIDATED', "finished_at" = now()
    WHERE "id" = attempt_row.id AND "status" = 'dispatched';
    IF FOUND THEN
      UPDATE "ai_usage_bucket"
      SET "unknown" = "unknown" + 1, "updated_at" = now()
      WHERE "scope" = 'global' AND "user_id" IS NULL
        AND "bucket_month" = attempt_row.reservation_bucket_month
        AND "consumed" > 0;
      UPDATE "ai_usage_bucket"
      SET "unknown" = "unknown" + 1, "updated_at" = now()
      WHERE "scope" = 'user' AND "user_id" = attempt_row.user_id
        AND "bucket_month" = attempt_row.reservation_bucket_month;
    END IF;
  END LOOP;

  -- Release all undispatched reservations matching this source. The count and
  -- cost subqueries handle several periods referencing the same source.
  UPDATE "ai_usage_bucket" b
  SET "reserved" = greatest(0, b."reserved" - (
        SELECT count(*)::int FROM "ai_report" r
        WHERE r."user_id" = OLD.user_id AND r."status" IN ('queued', 'running')
          AND r."dispatched_at" IS NULL AND r."deleted_at" IS NULL
          AND r."source_state" <> 'invalidated'
          AND EXISTS (SELECT 1 FROM "ai_report_source" s WHERE s."report_id" = r."id" AND s."user_id" = r."user_id" AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text)
      )),
      "released" = b."released" + (
        SELECT count(*)::int FROM "ai_report" r
        WHERE r."user_id" = OLD.user_id AND r."status" IN ('queued', 'running')
          AND r."dispatched_at" IS NULL AND r."deleted_at" IS NULL
          AND r."source_state" <> 'invalidated'
          AND EXISTS (SELECT 1 FROM "ai_report_source" s WHERE s."report_id" = r."id" AND s."user_id" = r."user_id" AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text)
      ),
      "updated_at" = now()
  WHERE b."scope" = 'user' AND b."user_id" = OLD.user_id
    AND EXISTS (
      SELECT 1 FROM "ai_report" r
      WHERE r."user_id" = OLD.user_id AND r."status" IN ('queued', 'running')
        AND r."dispatched_at" IS NULL AND r."deleted_at" IS NULL
        AND r."source_state" <> 'invalidated'
        AND EXISTS (SELECT 1 FROM "ai_report_source" s WHERE s."report_id" = r."id" AND s."user_id" = r."user_id" AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text)
    );

  UPDATE "ai_usage_bucket" b
  SET "reserved" = greatest(0, b."reserved" - (
        SELECT count(*)::int FROM "ai_report" r
        WHERE r."user_id" = OLD.user_id AND r."status" IN ('queued', 'running')
          AND r."dispatched_at" IS NULL AND r."deleted_at" IS NULL
          AND r."source_state" <> 'invalidated' AND r."reservation_cost_cents" > 0
          AND r."reservation_bucket_month" = b."bucket_month"
          AND EXISTS (SELECT 1 FROM "ai_report_source" s WHERE s."report_id" = r."id" AND s."user_id" = r."user_id" AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text)
      )),
      "reserved_cost_cents" = greatest(0, b."reserved_cost_cents" - COALESCE((
        SELECT sum(r."reservation_cost_cents")::int FROM "ai_report" r
        WHERE r."user_id" = OLD.user_id AND r."status" IN ('queued', 'running')
          AND r."dispatched_at" IS NULL AND r."deleted_at" IS NULL
          AND r."source_state" <> 'invalidated' AND r."reservation_cost_cents" > 0
          AND r."reservation_bucket_month" = b."bucket_month"
          AND EXISTS (SELECT 1 FROM "ai_report_source" s WHERE s."report_id" = r."id" AND s."user_id" = r."user_id" AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text)
      ), 0)),
      "released" = b."released" + (
        SELECT count(*)::int FROM "ai_report" r
        WHERE r."user_id" = OLD.user_id AND r."status" IN ('queued', 'running')
          AND r."dispatched_at" IS NULL AND r."deleted_at" IS NULL
          AND r."source_state" <> 'invalidated' AND r."reservation_cost_cents" > 0
          AND r."reservation_bucket_month" = b."bucket_month"
          AND EXISTS (SELECT 1 FROM "ai_report_source" s WHERE s."report_id" = r."id" AND s."user_id" = r."user_id" AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text)
      ),
      "updated_at" = now()
  WHERE b."scope" = 'global' AND b."user_id" IS NULL
    AND EXISTS (
      SELECT 1 FROM "ai_report" r
      WHERE r."user_id" = OLD.user_id AND r."status" IN ('queued', 'running')
        AND r."dispatched_at" IS NULL AND r."deleted_at" IS NULL
        AND r."source_state" <> 'invalidated' AND r."reservation_cost_cents" > 0
        AND r."reservation_bucket_month" = b."bucket_month"
        AND EXISTS (SELECT 1 FROM "ai_report_source" s WHERE s."report_id" = r."id" AND s."user_id" = r."user_id" AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text)
    );

  UPDATE "ai_report" r
  SET "source_state" = 'invalidated',
      "status" = CASE WHEN r."status" IN ('queued', 'running') THEN 'cancelled'::ai_report_status ELSE r."status" END,
      "error_code" = CASE WHEN r."status" IN ('queued', 'running') THEN 'AI_SOURCE_INVALIDATED' ELSE r."error_code" END,
      "source_invalidated_at" = now(), "analysis_json" = NULL, "metrics_json" = '[]',
      "coverage_json" = '{"diaries":{"count":0,"available":false},"transactions":{"count":0,"available":false},"holdings":{"count":0,"available":false},"disciplines":{"count":0,"available":false},"notes":["Source invalidated"]}',
      "input_snapshot_encrypted" = NULL,
      "finished_at" = CASE WHEN r."status" IN ('queued', 'running') THEN now() ELSE r."finished_at" END,
      "updated_at" = now()
  WHERE r."user_id" = OLD.user_id AND r."deleted_at" IS NULL
    AND r."source_state" <> 'invalidated'
    AND EXISTS (SELECT 1 FROM "ai_report_source" s WHERE s."report_id" = r."id" AND s."user_id" = r."user_id" AND s."source_type" = source_kind::ai_report_source_type AND s."source_id" = OLD.id::text);
  -- Once a source is invalidated, its manifest contains private identity and
  -- content hashes. Purge every manifest row for the affected report.
  DELETE FROM "ai_report_source" s
  WHERE s."user_id" = OLD.user_id
    AND EXISTS (
      SELECT 1 FROM "ai_report" r
      WHERE r."id" = s."report_id" AND r."user_id" = s."user_id"
        AND r."source_state" = 'invalidated' AND r."deleted_at" IS NULL
    );
  RETURN OLD;
END;
$$;
--> statement-breakpoint
-- Account deletion cascades reports directly and therefore does not invoke a
-- diary/transaction source trigger for reports without a source manifest.
CREATE OR REPLACE FUNCTION ai_reconcile_report_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  attempt_row record;
BEGIN
  PERFORM pg_advisory_xact_lock(7441, hashtext(OLD.user_id::text));
  IF OLD.status IN ('queued', 'running') AND OLD.dispatched_at IS NULL THEN
    UPDATE "ai_usage_bucket"
    SET "reserved" = greatest(0, "reserved" - 1), "released" = "released" + 1, "updated_at" = now()
    WHERE "scope" = 'user' AND "user_id" = OLD.user_id AND "bucket_month" = OLD.reservation_bucket_month;
    IF OLD.reservation_cost_cents > 0 THEN
      UPDATE "ai_usage_bucket"
      SET "reserved" = greatest(0, "reserved" - 1),
          "reserved_cost_cents" = greatest(0, "reserved_cost_cents" - OLD.reservation_cost_cents),
          "released" = "released" + 1, "updated_at" = now()
      WHERE "scope" = 'global' AND "user_id" IS NULL AND "bucket_month" = OLD.reservation_bucket_month;
    END IF;
  END IF;
  FOR attempt_row IN
    SELECT a.id, a.user_id, a.reservation_bucket_month
    FROM "ai_report_attempt" a
    WHERE a.report_id = OLD.id AND a.status = 'dispatched'
  LOOP
    UPDATE "ai_report_attempt"
    SET "status" = 'unknown', "error_code" = 'AI_PROVIDER_OUTCOME_UNKNOWN', "finished_at" = now()
    WHERE "id" = attempt_row.id AND "status" = 'dispatched';
    IF FOUND THEN
      UPDATE "ai_usage_bucket"
      SET "unknown" = "unknown" + 1, "updated_at" = now()
      WHERE "scope" = 'global' AND "user_id" IS NULL AND "bucket_month" = attempt_row.reservation_bucket_month;
      UPDATE "ai_usage_bucket"
      SET "unknown" = "unknown" + 1, "updated_at" = now()
      WHERE "scope" = 'user' AND "user_id" = attempt_row.user_id AND "bucket_month" = attempt_row.reservation_bucket_month;
    END IF;
  END LOOP;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ai_report_reconcile_delete ON "ai_report";
CREATE TRIGGER ai_report_reconcile_delete
BEFORE DELETE ON "ai_report"
FOR EACH ROW EXECUTE FUNCTION ai_reconcile_report_delete();
--> statement-breakpoint
ALTER TABLE "ai_report_attempt" DROP CONSTRAINT "ai_report_attempt_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_report_attempt" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_report_attempt" ADD COLUMN "slot_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_report_attempt" ADD COLUMN "slot_released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_report_attempt" ADD CONSTRAINT "ai_report_attempt_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_report_attempt_active_slot_idx" ON "ai_report_attempt" USING btree ("slot_expires_at") WHERE "ai_report_attempt"."slot_released_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_report_attempt_report_once_key" ON "ai_report_attempt" USING btree ("report_id") WHERE "ai_report_attempt"."report_id" is not null;
