CREATE TABLE "article_translation_ai_profile" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "article_translation_ai_profile_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"base_url" varchar(500),
	"model" varchar(200),
	"encrypted_api_key" text,
	"secret_key_version" integer,
	"timeout_ms" integer DEFAULT 60000 NOT NULL,
	"translation_prompt" text NOT NULL,
	"prompt_version" varchar(80) DEFAULT 'article-translation-v1' NOT NULL,
	"max_tokens" integer DEFAULT 8000 NOT NULL,
	"max_calls_per_job" integer DEFAULT 2 NOT NULL,
	"token_budget_per_job" integer DEFAULT 16000 NOT NULL,
	"allow_member_articles" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_translation_ai_profile_timeout_bounds" CHECK ("article_translation_ai_profile"."timeout_ms" between 1000 and 300000),
	CONSTRAINT "article_translation_ai_profile_token_bounds" CHECK ("article_translation_ai_profile"."max_tokens" > 0 and "article_translation_ai_profile"."max_tokens" <= 128000 and "article_translation_ai_profile"."token_budget_per_job" > 0 and "article_translation_ai_profile"."token_budget_per_job" <= 256000),
	CONSTRAINT "article_translation_ai_profile_calls_bounds" CHECK ("article_translation_ai_profile"."max_calls_per_job" between 1 and 10),
	CONSTRAINT "article_translation_ai_profile_revision_positive" CHECK ("article_translation_ai_profile"."revision" > 0),
	CONSTRAINT "article_translation_ai_profile_base_url_https" CHECK ("article_translation_ai_profile"."base_url" is null or "article_translation_ai_profile"."base_url" like 'https://%'),
	CONSTRAINT "article_translation_ai_profile_enabled_complete" CHECK (not "article_translation_ai_profile"."enabled" or ("article_translation_ai_profile"."base_url" is not null and "article_translation_ai_profile"."model" is not null and "article_translation_ai_profile"."encrypted_api_key" is not null))
);
--> statement-breakpoint
CREATE TABLE "article_translation_ai_settings" (
	"singleton" varchar(16) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"default_profile_id" bigint,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_translation_ai_settings_revision_positive" CHECK ("article_translation_ai_settings"."revision" > 0)
);
--> statement-breakpoint
DROP INDEX "article_translation_job_active_identity_key";--> statement-breakpoint
ALTER TABLE "article_translation_job" ADD COLUMN "ai_profile_id" bigint;--> statement-breakpoint
INSERT INTO "article_translation_ai_profile" (
	"name", "enabled", "base_url", "model", "encrypted_api_key", "secret_key_version", "timeout_ms",
	"translation_prompt", "prompt_version", "max_tokens", "max_calls_per_job", "token_budget_per_job",
	"allow_member_articles", "revision", "updated_by", "created_at", "updated_at"
)
SELECT 'Migrated AI provider', "enabled", "base_url", "model", "encrypted_api_key", "secret_key_version", "timeout_ms",
	"translation_prompt", "prompt_version", "max_tokens", "max_calls_per_job", "token_budget_per_job",
	"allow_member_articles", "revision", "updated_by", "updated_at", "updated_at"
FROM "article_translation_ai_config"
WHERE "base_url" IS NOT NULL OR "model" IS NOT NULL OR "encrypted_api_key" IS NOT NULL OR "enabled";
--> statement-breakpoint
INSERT INTO "article_translation_ai_settings" ("singleton", "default_profile_id", "revision", "updated_by")
SELECT 'default',
	(SELECT "id" FROM "article_translation_ai_profile" WHERE "name" = 'Migrated AI provider' AND "enabled" AND "base_url" IS NOT NULL AND "model" IS NOT NULL AND "encrypted_api_key" IS NOT NULL LIMIT 1),
	1, "updated_by"
FROM "article_translation_ai_config"
LIMIT 1;
--> statement-breakpoint
UPDATE "article_translation_job" AS job
SET "ai_profile_id" = profile."id"
FROM "article_translation_ai_profile" AS profile
WHERE job."provider" = 'ai' AND profile."name" = 'Migrated AI provider';
--> statement-breakpoint
UPDATE "article_translation_runtime"
SET "active_job_id" = NULL, "active_lease_token" = NULL, "active_lease_expires_at" = NULL, "worker_id" = NULL, "worker_heartbeat_at" = now(), "updated_at" = now()
WHERE "active_job_id" IN (
	SELECT "id" FROM "article_translation_job" WHERE "provider" = 'ai' AND "status" IN ('queued', 'running') AND "ai_profile_id" IS NULL
);
--> statement-breakpoint
UPDATE "article_translation_job"
SET "status" = 'failed', "error" = 'TRANSLATION_CONFIGURATION_INVALID', "progress" = 100,
	"lease_token" = NULL, "worker_id" = NULL, "lease_expires_at" = NULL, "finished_at" = now(), "updated_at" = now()
WHERE "provider" = 'ai' AND "status" IN ('queued', 'running') AND "ai_profile_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "article_translation_ai_config" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "article_translation_ai_config" CASCADE;--> statement-breakpoint
ALTER TABLE "article_translation_ai_profile" ADD CONSTRAINT "article_translation_ai_profile_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_translation_ai_settings" ADD CONSTRAINT "article_translation_ai_settings_default_profile_id_article_translation_ai_profile_id_fk" FOREIGN KEY ("default_profile_id") REFERENCES "public"."article_translation_ai_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_translation_ai_settings" ADD CONSTRAINT "article_translation_ai_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_translation_ai_profile_name_key" ON "article_translation_ai_profile" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "article_translation_job" ADD CONSTRAINT "article_translation_job_ai_profile_id_article_translation_ai_profile_id_fk" FOREIGN KEY ("ai_profile_id") REFERENCES "public"."article_translation_ai_profile"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_translation_job_active_identity_key" ON "article_translation_job" USING btree ("post_id","target_locale","source_revision","source_hash","provider",coalesce("ai_profile_id", 0::bigint),"config_revision") WHERE "article_translation_job"."status" in ('queued', 'running');--> statement-breakpoint
ALTER TABLE "article_translation_job" ADD CONSTRAINT "article_translation_job_ai_profile_consistent" CHECK ("article_translation_job"."provider" <> 'ai' or "article_translation_job"."status" not in ('queued', 'running') or ("article_translation_job"."ai_profile_id" is not null and "article_translation_job"."config_revision" > 0));
