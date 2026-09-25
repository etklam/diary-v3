ALTER TABLE "article_translation_job" ADD COLUMN "provider_profile_name" varchar(100);--> statement-breakpoint
UPDATE "article_translation_job" AS job SET "provider_profile_name" = profile."name"
FROM "article_translation_ai_profile" AS profile
WHERE job."ai_profile_id" = profile."id" AND job."provider" = 'ai';
