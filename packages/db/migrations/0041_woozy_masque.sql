CREATE TABLE "diary_saved_views" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "diary_saved_views_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"name" varchar(80) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"query" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "stock_watchlists_user_status_sort_idx";--> statement-breakpoint
ALTER TABLE "stock_watchlists" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
WITH ranked AS (
	SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY "pinned" DESC, "sort_order" ASC, "id" ASC) - 1 AS "normalized_sort_order"
	FROM "stock_watchlists"
	WHERE "status" = 'WATCHING'
)
UPDATE "stock_watchlists" AS watch
SET "sort_order" = ranked."normalized_sort_order"
FROM ranked
WHERE watch."id" = ranked."id";--> statement-breakpoint
ALTER TABLE "diary_saved_views" ADD CONSTRAINT "diary_saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "diary_saved_views_user_name_key" ON "diary_saved_views" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "diary_saved_views_user_updated_idx" ON "diary_saved_views" USING btree ("user_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_watchlists_user_status_sort_idx" ON "stock_watchlists" USING btree ("user_id","status","pinned","sort_order","id");--> statement-breakpoint
