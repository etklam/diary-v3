CREATE TYPE "public"."post_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "posts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "posts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"author_id" bigint NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"excerpt" text,
	"cover_image" varchar(500),
	"category" varchar(100) NOT NULL,
	"tags" varchar(500),
	"status" "public"."post_status" DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "posts_author_id_idx" ON "posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "posts_status_idx" ON "posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "posts_published_at_idx" ON "posts" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "posts_status_published_idx" ON "posts" USING btree ("status", "published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_category_status_idx" ON "posts" USING btree ("category", "status");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "unaccent";--> statement-breakpoint
CREATE INDEX "posts_title_search_idx" ON "posts" USING gin (to_tsvector('simple', coalesce("title", '')));--> statement-breakpoint
CREATE INDEX "posts_excerpt_search_idx" ON "posts" USING gin (to_tsvector('simple', coalesce("excerpt", '')));
