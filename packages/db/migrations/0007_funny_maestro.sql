CREATE TYPE "public"."stock_watch_status" AS ENUM('WATCHING', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "stock_watchlists" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_watchlists_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"stock_id" bigint NOT NULL,
	"status" "stock_watch_status" DEFAULT 'WATCHING' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_watchlists_user_stock_key" UNIQUE("user_id","stock_id"),
	CONSTRAINT "stock_watchlists_sort_nonnegative" CHECK ("stock_watchlists"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stock_watchlists" ADD CONSTRAINT "stock_watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_watchlists" ADD CONSTRAINT "stock_watchlists_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_watchlists_user_status_sort_idx" ON "stock_watchlists" USING btree ("user_id","status","sort_order","id");