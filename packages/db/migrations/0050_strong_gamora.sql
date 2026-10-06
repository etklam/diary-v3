CREATE TYPE "public"."institutional_security_mapping_refresh_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETE');--> statement-breakpoint
CREATE TABLE "institutional_security_mapping_refresh_jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_security_mapping_refresh_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"security_id" bigint NOT NULL,
	"status" "institutional_security_mapping_refresh_status" DEFAULT 'PENDING' NOT NULL,
	"last_filing_id" bigint DEFAULT 0 NOT NULL,
	"processed_filing_count" integer DEFAULT 0 NOT NULL,
	"lease_token" varchar(128),
	"lease_expires_at" timestamp with time zone,
	"last_error" varchar(160),
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "institutional_security_mapping_refresh_jobs_cursor_nonnegative" CHECK ("institutional_security_mapping_refresh_jobs"."last_filing_id" >= 0 and "institutional_security_mapping_refresh_jobs"."processed_filing_count" >= 0),
	CONSTRAINT "institutional_security_mapping_refresh_jobs_lease_consistent" CHECK (("institutional_security_mapping_refresh_jobs"."lease_token" is null and "institutional_security_mapping_refresh_jobs"."lease_expires_at" is null) or ("institutional_security_mapping_refresh_jobs"."lease_token" is not null and "institutional_security_mapping_refresh_jobs"."lease_expires_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "institutional_security_identifiers" ADD COLUMN "supersedes_identifier_id" bigint;--> statement-breakpoint
ALTER TABLE "institutional_security_mapping_refresh_jobs" ADD CONSTRAINT "institutional_security_mapping_refresh_jobs_security_id_institutional_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_security_mapping_refresh_jobs" ADD CONSTRAINT "institutional_security_mapping_refresh_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "institutional_security_mapping_refresh_jobs_queue_idx" ON "institutional_security_mapping_refresh_jobs" USING btree ("status","id");--> statement-breakpoint
ALTER TABLE "institutional_securities" ADD CONSTRAINT "institutional_securities_source_verified_by_users_id_fk" FOREIGN KEY ("source_verified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_security_identifiers" ADD CONSTRAINT "institutional_security_identifiers_supersedes_identifier_id_institutional_security_identifiers_id_fk" FOREIGN KEY ("supersedes_identifier_id") REFERENCES "public"."institutional_security_identifiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_security_identifiers" ADD CONSTRAINT "institutional_security_identifiers_source_verified_by_users_id_fk" FOREIGN KEY ("source_verified_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_security_identity_events" ADD CONSTRAINT "institutional_security_identity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_security_mapping_overrides" ADD CONSTRAINT "institutional_security_mapping_overrides_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_security_identifiers_supersedes_unique" ON "institutional_security_identifiers" USING btree ("supersedes_identifier_id") WHERE "institutional_security_identifiers"."supersedes_identifier_id" is not null;--> statement-breakpoint
ALTER TABLE "institutional_security_identifiers" ADD CONSTRAINT "institutional_security_identifiers_format_valid" CHECK (
    ("institutional_security_identifiers"."type" = 'CUSIP' and "institutional_security_identifiers"."value" ~ '^[A-Z0-9*@#]{9}$') or
    ("institutional_security_identifiers"."type" = 'FIGI' and "institutional_security_identifiers"."value" ~ '^[A-Z0-9]{12}$') or
    ("institutional_security_identifiers"."type" = 'TICKER' and "institutional_security_identifiers"."value" ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$')
  );