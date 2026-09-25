ALTER TABLE "research_article_link" ADD COLUMN "title_hash" varchar(64);--> statement-breakpoint
UPDATE "research_article_link" SET "title_hash" = repeat('0', 64) WHERE "title_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "research_article_link" ALTER COLUMN "title_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "research_article_link" ADD CONSTRAINT "research_article_link_title_hash_shape" CHECK ("research_article_link"."title_hash" ~ '^[a-f0-9]{64}$');
