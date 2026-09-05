CREATE TYPE "public"."stock_note_created_via" AS ENUM('USER', 'AGENT');--> statement-breakpoint
CREATE TABLE "stock_notes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"stock_id" bigint NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_via" "stock_note_created_via" DEFAULT 'USER' NOT NULL,
	"created_by_label" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_notes" ADD CONSTRAINT "stock_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_notes" ADD CONSTRAINT "stock_notes_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_notes_user_stock_date_idx" ON "stock_notes" USING btree ("user_id","stock_id","date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_notes_stock_date_idx" ON "stock_notes" USING btree ("stock_id","date" DESC NULLS LAST);