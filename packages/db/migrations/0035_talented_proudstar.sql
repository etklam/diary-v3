DROP INDEX "article_translation_job_active_locale_key";--> statement-breakpoint
UPDATE "article_translation_job" SET "config_revision" = 0 WHERE "config_revision" IS NULL;--> statement-breakpoint
ALTER TABLE "article_translation_job" ALTER COLUMN "config_revision" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "article_translation_job" ALTER COLUMN "config_revision" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "article_translation_job_active_identity_key" ON "article_translation_job" USING btree ("post_id","target_locale","source_revision","source_hash","provider","config_revision") WHERE "article_translation_job"."status" in ('queued', 'running');
