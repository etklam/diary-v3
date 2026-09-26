CREATE TYPE "public"."account_email_token_purpose" AS ENUM('registration', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."mail_audit_result" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TYPE "public"."mail_outbox_kind" AS ENUM('registration_verification', 'password_reset', 'password_changed', 'admin_test');--> statement-breakpoint
CREATE TYPE "public"."mail_outbox_status" AS ENUM('queued', 'running', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."smtp_auth_mode" AS ENUM('none', 'password');--> statement-breakpoint
CREATE TYPE "public"."smtp_security_mode" AS ENUM('none', 'tls', 'starttls');--> statement-breakpoint
CREATE TYPE "public"."smtp_test_status" AS ENUM('passed', 'failed');--> statement-breakpoint
CREATE TABLE "email_request_rate_limit" (
	"digest" varchar(64) PRIMARY KEY NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_request_rate_limit_digest_shape" CHECK ("email_request_rate_limit"."digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "email_request_rate_limit_count_nonnegative" CHECK ("email_request_rate_limit"."request_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "account_email_token" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "account_email_token_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"purpose" "account_email_token_purpose" NOT NULL,
	"normalized_email" varchar(320) NOT NULL,
	"user_id" bigint,
	"token_digest" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_email_token_digest_key" UNIQUE("token_digest"),
	CONSTRAINT "account_email_token_email_normalized" CHECK ("account_email_token"."normalized_email" = lower(btrim("account_email_token"."normalized_email")) and length("account_email_token"."normalized_email") > 0),
	CONSTRAINT "account_email_token_digest_shape" CHECK ("account_email_token"."token_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "account_email_token_purpose_user_consistent" CHECK (("account_email_token"."purpose" = 'registration' and "account_email_token"."user_id" is null) or ("account_email_token"."purpose" = 'password_reset' and "account_email_token"."user_id" is not null)),
	CONSTRAINT "account_email_token_terminal_state_exclusive" CHECK (not ("account_email_token"."consumed_at" is not null and "account_email_token"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "mail_admin_audit_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mail_admin_audit_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" bigint,
	"action" varchar(80) NOT NULL,
	"result" "mail_audit_result" NOT NULL,
	"config_revision" integer,
	"error_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_admin_audit_action_nonempty" CHECK (length(btrim("mail_admin_audit_event"."action")) > 0),
	CONSTRAINT "mail_admin_audit_config_revision_positive" CHECK ("mail_admin_audit_event"."config_revision" is null or "mail_admin_audit_event"."config_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "mail_outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mail_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" "mail_outbox_kind" NOT NULL,
	"recipient_email" varchar(320) NOT NULL,
	"locale" varchar(5) NOT NULL,
	"encrypted_payload" text,
	"token_id" bigint,
	"status" "mail_outbox_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"lease_token" varchar(128),
	"worker_id" varchar(128),
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"config_revision_used" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_error_code" varchar(80),
	"last_error_detail" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_outbox_recipient_email_shape" CHECK ("mail_outbox"."recipient_email" ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
	CONSTRAINT "mail_outbox_locale_valid" CHECK ("mail_outbox"."locale" in ('zh-TW', 'zh-CN', 'en')),
	CONSTRAINT "mail_outbox_attempt_bounds" CHECK ("mail_outbox"."attempts" between 0 and "mail_outbox"."max_attempts" and "mail_outbox"."max_attempts" between 1 and 5),
	CONSTRAINT "mail_outbox_config_revision_positive" CHECK ("mail_outbox"."config_revision_used" is null or "mail_outbox"."config_revision_used" > 0),
	CONSTRAINT "mail_outbox_lease_consistent" CHECK (("mail_outbox"."status" = 'running' and "mail_outbox"."lease_token" is not null and "mail_outbox"."worker_id" is not null and "mail_outbox"."lease_expires_at" is not null and "mail_outbox"."started_at" is not null and "mail_outbox"."finished_at" is null and "mail_outbox"."sent_at" is null) or ("mail_outbox"."status" <> 'running' and "mail_outbox"."lease_token" is null and "mail_outbox"."worker_id" is null and "mail_outbox"."lease_expires_at" is null)),
	CONSTRAINT "mail_outbox_terminal_state_consistent" CHECK (("mail_outbox"."status" in ('queued', 'running') and "mail_outbox"."finished_at" is null and "mail_outbox"."sent_at" is null) or ("mail_outbox"."status" = 'sent' and "mail_outbox"."finished_at" is not null and "mail_outbox"."sent_at" is not null) or ("mail_outbox"."status" in ('failed', 'cancelled') and "mail_outbox"."finished_at" is not null and "mail_outbox"."sent_at" is null)),
	CONSTRAINT "mail_outbox_payload_retention" CHECK ("mail_outbox"."status" in ('queued', 'running') or "mail_outbox"."encrypted_payload" is null),
	CONSTRAINT "mail_outbox_queued_payload" CHECK ("mail_outbox"."status" not in ('queued', 'running') or "mail_outbox"."encrypted_payload" is not null)
);
--> statement-breakpoint
CREATE TABLE "smtp_settings" (
	"singleton" varchar(16) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"host" varchar(255),
	"port" integer,
	"security" "smtp_security_mode",
	"auth" "smtp_auth_mode" DEFAULT 'none' NOT NULL,
	"username" varchar(320),
	"encrypted_password" text,
	"sender_name" varchar(200),
	"sender_email" varchar(320),
	"reply_to_email" varchar(320),
	"revision" integer DEFAULT 1 NOT NULL,
	"last_tested_revision" integer,
	"last_tested_at" timestamp with time zone,
	"last_test_status" "smtp_test_status",
	"last_test_error_code" varchar(80),
	"updated_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "smtp_settings_singleton_check" CHECK ("smtp_settings"."singleton" = 'default'),
	CONSTRAINT "smtp_settings_host_nonempty" CHECK ("smtp_settings"."host" is null or length(btrim("smtp_settings"."host")) > 0),
	CONSTRAINT "smtp_settings_port_bounds" CHECK ("smtp_settings"."port" is null or "smtp_settings"."port" between 1 and 65535),
	CONSTRAINT "smtp_settings_username_nonempty" CHECK ("smtp_settings"."username" is null or length(btrim("smtp_settings"."username")) > 0),
	CONSTRAINT "smtp_settings_encrypted_password_nonempty" CHECK ("smtp_settings"."encrypted_password" is null or length("smtp_settings"."encrypted_password") > 0),
	CONSTRAINT "smtp_settings_sender_name_nonempty" CHECK ("smtp_settings"."sender_name" is null or length(btrim("smtp_settings"."sender_name")) > 0),
	CONSTRAINT "smtp_settings_sender_email_shape" CHECK ("smtp_settings"."sender_email" is null or "smtp_settings"."sender_email" ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
	CONSTRAINT "smtp_settings_reply_to_email_shape" CHECK ("smtp_settings"."reply_to_email" is null or "smtp_settings"."reply_to_email" ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
	CONSTRAINT "smtp_settings_auth_fields" CHECK (not "smtp_settings"."enabled" or "smtp_settings"."auth" <> 'password' or (nullif(btrim("smtp_settings"."username"), '') is not null and "smtp_settings"."encrypted_password" is not null)),
	CONSTRAINT "smtp_settings_revision_positive" CHECK ("smtp_settings"."revision" > 0),
	CONSTRAINT "smtp_settings_test_revision_positive" CHECK ("smtp_settings"."last_tested_revision" is null or "smtp_settings"."last_tested_revision" > 0),
	CONSTRAINT "smtp_settings_test_metadata_consistent" CHECK (("smtp_settings"."last_test_status" is null and "smtp_settings"."last_tested_at" is null and "smtp_settings"."last_tested_revision" is null) or ("smtp_settings"."last_test_status" is not null and "smtp_settings"."last_tested_at" is not null and "smtp_settings"."last_tested_revision" is not null)),
	CONSTRAINT "smtp_settings_enabled_complete" CHECK (not "smtp_settings"."enabled" or ("smtp_settings"."host" is not null and "smtp_settings"."port" is not null and "smtp_settings"."security" in ('tls', 'starttls') and "smtp_settings"."sender_name" is not null and "smtp_settings"."sender_email" is not null and "smtp_settings"."last_test_status" = 'passed' and "smtp_settings"."last_tested_at" is not null and "smtp_settings"."last_tested_revision" = "smtp_settings"."revision"))
);
--> statement-breakpoint
INSERT INTO "smtp_settings" ("singleton", "enabled")
VALUES ('default', false)
ON CONFLICT ("singleton") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "account_email_token" ADD CONSTRAINT "account_email_token_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_admin_audit_event" ADD CONSTRAINT "mail_admin_audit_event_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_outbox" ADD CONSTRAINT "mail_outbox_token_id_account_email_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."account_email_token"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smtp_settings" ADD CONSTRAINT "smtp_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_request_rate_limit_expiry_idx" ON "email_request_rate_limit" USING btree ("expires_at","digest");--> statement-breakpoint
CREATE INDEX "email_request_rate_limit_blocked_idx" ON "email_request_rate_limit" USING btree ("blocked_until","digest");--> statement-breakpoint
CREATE UNIQUE INDEX "account_email_token_active_email_key" ON "account_email_token" USING btree ("purpose","normalized_email") WHERE "account_email_token"."consumed_at" is null and "account_email_token"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "account_email_token_active_user_key" ON "account_email_token" USING btree ("purpose","user_id") WHERE "account_email_token"."user_id" is not null and "account_email_token"."consumed_at" is null and "account_email_token"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "account_email_token_expiry_idx" ON "account_email_token" USING btree ("expires_at","id");--> statement-breakpoint
CREATE INDEX "account_email_token_user_purpose_idx" ON "account_email_token" USING btree ("user_id","purpose","expires_at");--> statement-breakpoint
CREATE INDEX "mail_admin_audit_created_idx" ON "mail_admin_audit_event" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mail_admin_audit_actor_idx" ON "mail_admin_audit_event" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mail_admin_audit_action_idx" ON "mail_admin_audit_event" USING btree ("action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "mail_outbox_active_token_key" ON "mail_outbox" USING btree ("token_id") WHERE "mail_outbox"."token_id" is not null and "mail_outbox"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "mail_outbox_claim_idx" ON "mail_outbox" USING btree ("status","next_attempt_at","expires_at","id");--> statement-breakpoint
CREATE INDEX "mail_outbox_lease_idx" ON "mail_outbox" USING btree ("status","lease_expires_at","id") WHERE "mail_outbox"."status" = 'running';--> statement-breakpoint
CREATE INDEX "mail_outbox_expiry_idx" ON "mail_outbox" USING btree ("expires_at","id");--> statement-breakpoint
CREATE INDEX "mail_outbox_token_idx" ON "mail_outbox" USING btree ("token_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "mail_outbox_status_created_idx" ON "mail_outbox" USING btree ("status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
