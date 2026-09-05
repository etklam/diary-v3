CREATE TYPE "public"."diary_created_via" AS ENUM('WEB', 'API_KEY', 'TELEGRAM_BOT');--> statement-breakpoint
CREATE TYPE "public"."diary_review_status" AS ENUM('none', 'pending', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."refresh_token_client_type" AS ENUM('WEB', 'NATIVE');--> statement-breakpoint
CREATE TYPE "public"."refresh_token_revocation_reason" AS ENUM('ROTATED', 'LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."thesis_review_outcome" AS ENUM('INTACT', 'PARTIAL', 'INVALIDATED', 'UNCLEAR');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "diaries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "diaries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"tags" varchar(500),
	"created_via" "diary_created_via" DEFAULT 'WEB' NOT NULL,
	"created_by_label" varchar(100),
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"thesis" text,
	"risk" text,
	"execution" text,
	"review_due_at" timestamp with time zone,
	"review_status" "diary_review_status" DEFAULT 'none' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"review_outcome" "thesis_review_outcome",
	"review_summary" text,
	"review_learning" text,
	"review_adjustment" text,
	CONSTRAINT "diaries_user_date_key" UNIQUE("user_id","date"),
	CONSTRAINT "diaries_id_user_id_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "refresh_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"token" varchar(500) NOT NULL,
	"user_id" bigint NOT NULL,
	"client_type" "refresh_token_client_type" DEFAULT 'WEB' NOT NULL,
	"family_id" varchar(64) NOT NULL,
	"device_name" varchar(100),
	"parent_id" bigint,
	"replacement_id" bigint,
	"revoked_at" timestamp with time zone,
	"revocation_reason" "refresh_token_revocation_reason",
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_key" UNIQUE("token"),
	CONSTRAINT "refresh_tokens_replacement_id_key" UNIQUE("replacement_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" varchar(255) NOT NULL,
	"password" text NOT NULL,
	"name" text,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"expected_monthly_trades" integer DEFAULT 20 NOT NULL,
	"expected_profit" numeric(15, 2) DEFAULT '0' NOT NULL,
	"expected_avg_holding" numeric(15, 2) DEFAULT '0' NOT NULL,
	"timezone" varchar(50) DEFAULT 'Asia/Taipei' NOT NULL,
	"favorite_tags" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_expected_monthly_trades_nonnegative" CHECK ("users"."expected_monthly_trades" >= 0)
);
--> statement-breakpoint
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_parent_id_refresh_tokens_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."refresh_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replacement_id_refresh_tokens_id_fk" FOREIGN KEY ("replacement_id") REFERENCES "public"."refresh_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diaries_user_id_idx" ON "diaries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "diaries_user_created_idx" ON "diaries" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_client_idx" ON "refresh_tokens" USING btree ("user_id","client_type");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_revoked_idx" ON "refresh_tokens" USING btree ("family_id","revoked_at");--> statement-breakpoint
CREATE INDEX "refresh_tokens_parent_id_idx" ON "refresh_tokens" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" USING btree (lower("email"));