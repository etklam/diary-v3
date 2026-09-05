CREATE TYPE "public"."api_key_scope" AS ENUM('DIARY_CREATE', 'AGENT_WRITE');--> statement-breakpoint
CREATE TABLE "api_key_credentials" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_key_credentials_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"label" varchar(100) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_prefix" varchar(12) NOT NULL,
	"scope" "api_key_scope" DEFAULT 'DIARY_CREATE' NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_credentials_hash_key" UNIQUE("key_hash"),
	CONSTRAINT "api_key_credentials_label_nonempty" CHECK (length(btrim("api_key_credentials"."label")) > 0),
	CONSTRAINT "api_key_credentials_hash_format" CHECK ("api_key_credentials"."key_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "api_key_credentials_prefix_format" CHECK ("api_key_credentials"."key_prefix" ~ '^dva_[0-9a-f]{8}$')
);
--> statement-breakpoint
ALTER TABLE "api_key_credentials" ADD CONSTRAINT "api_key_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_key_credentials_user_created_idx" ON "api_key_credentials" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);