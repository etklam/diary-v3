CREATE TYPE "public"."post_access" AS ENUM('PUBLIC', 'MEMBER');--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "excerpt_authored" boolean;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "access" "post_access";--> statement-breakpoint
UPDATE "posts"
SET "access" = 'PUBLIC'
WHERE "status" = 'PUBLISHED' AND "published_at" IS NOT NULL;--> statement-breakpoint
UPDATE "posts"
SET "access" = 'MEMBER'
WHERE "access" IS NULL;--> statement-breakpoint
UPDATE "posts"
SET "excerpt_authored" = false
WHERE "excerpt_authored" IS NULL;--> statement-breakpoint
DO $$
DECLARE
  public_count bigint;
  member_count bigint;
  ambiguous_count bigint;
BEGIN
  SELECT count(*) INTO public_count FROM "posts" WHERE "access" = 'PUBLIC';
  SELECT count(*) INTO member_count FROM "posts" WHERE "access" = 'MEMBER';
  SELECT count(*) INTO ambiguous_count FROM "posts" WHERE NOT ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL);
  RAISE NOTICE 'article access migration classified % rows as PUBLIC and % rows as MEMBER; % ambiguous pre-existing rows were kept MEMBER for review', public_count, member_count, ambiguous_count;
END $$;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "excerpt_authored" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "excerpt_authored" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "access" SET DEFAULT 'MEMBER';--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "access" SET NOT NULL;
