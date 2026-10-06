CREATE TYPE "public"."institutional_filing_status" AS ENUM('PENDING', 'DOWNLOADED', 'PARSED', 'PARTIAL', 'READY', 'ERROR', 'SUPERSEDED');--> statement-breakpoint
CREATE TABLE "institutional_13f_holdings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_13f_holdings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"filing_id" bigint NOT NULL,
	"document_id" bigint NOT NULL,
	"artifact_id" bigint NOT NULL,
	"row_number" integer NOT NULL,
	"issuer" text NOT NULL,
	"title_of_class" varchar(160) NOT NULL,
	"cusip" varchar(32),
	"figi" varchar(32),
	"reported_value" numeric(32, 8) NOT NULL,
	"reported_value_unit" varchar(32) NOT NULL,
	"value_unit_source" varchar(120) NOT NULL,
	"quantity" numeric(32, 8) NOT NULL,
	"quantity_type" varchar(8) NOT NULL,
	"put_call" varchar(8),
	"investment_discretion" varchar(32),
	"other_managers" text[] DEFAULT '{}'::text[] NOT NULL,
	"voting_authority" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_url" varchar(2048) NOT NULL,
	"raw_row" text NOT NULL,
	"warnings" text[] DEFAULT '{}'::text[] NOT NULL,
	"parser_version" varchar(32) NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	CONSTRAINT "institutional_13f_holdings_document_row_unique" UNIQUE("document_id","row_number"),
	CONSTRAINT "institutional_13f_holdings_row_positive" CHECK ("institutional_13f_holdings"."row_number" > 0),
	CONSTRAINT "institutional_13f_holdings_quantity_type_valid" CHECK ("institutional_13f_holdings"."quantity_type" in ('SH', 'PRN')),
	CONSTRAINT "institutional_13f_holdings_put_call_valid" CHECK ("institutional_13f_holdings"."put_call" is null or "institutional_13f_holdings"."put_call" in ('PUT', 'CALL')),
	CONSTRAINT "institutional_13f_holdings_numeric_nonnegative" CHECK ("institutional_13f_holdings"."reported_value" >= 0 and "institutional_13f_holdings"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "institutional_filing_artifacts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_filing_artifacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"document_id" bigint NOT NULL,
	"artifact_ref" varchar(600) NOT NULL,
	"content_sha256" varchar(64) NOT NULL,
	"raw_content" text,
	"content_length" bigint NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"fetched_reason" varchar(24) DEFAULT 'initial' NOT NULL,
	"retain_until" timestamp with time zone,
	"supersedes_artifact_id" bigint,
	CONSTRAINT "institutional_filing_artifacts_document_digest_unique" UNIQUE("document_id","content_sha256"),
	CONSTRAINT "institutional_filing_artifacts_ref_unique" UNIQUE("artifact_ref"),
	CONSTRAINT "institutional_filing_artifacts_digest_valid" CHECK ("institutional_filing_artifacts"."content_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "institutional_filing_artifacts_refetch_reason_valid" CHECK ("institutional_filing_artifacts"."fetched_reason" in ('initial', 'reprocess-refetch')),
	CONSTRAINT "institutional_filing_artifacts_content_retention" CHECK ("institutional_filing_artifacts"."raw_content" is not null or "institutional_filing_artifacts"."retain_until" is not null),
	CONSTRAINT "institutional_filing_artifacts_length_nonnegative" CHECK ("institutional_filing_artifacts"."content_length" >= 0)
);
--> statement-breakpoint
CREATE TABLE "institutional_filing_documents" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_filing_documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"filing_id" bigint NOT NULL,
	"basename" varchar(255) NOT NULL,
	"document_type" varchar(80),
	"description" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source_url" varchar(2048) NOT NULL,
	"content_length" bigint,
	"downloaded_at" timestamp with time zone,
	CONSTRAINT "institutional_filing_documents_filing_basename_unique" UNIQUE("filing_id","basename"),
	CONSTRAINT "institutional_filing_documents_length_nonnegative" CHECK ("institutional_filing_documents"."content_length" is null or "institutional_filing_documents"."content_length" >= 0)
);
--> statement-breakpoint
CREATE TABLE "institutional_filings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_filings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"manager_id" bigint NOT NULL,
	"accession" varchar(20) NOT NULL,
	"form" varchar(16) NOT NULL,
	"filing_date" date NOT NULL,
	"filed_at" timestamp with time zone,
	"period_end" date,
	"is_amendment" boolean DEFAULT false NOT NULL,
	"amendment_number" integer,
	"amendment_type" varchar(32),
	"source_url" varchar(2048) NOT NULL,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "institutional_filing_status" DEFAULT 'PENDING' NOT NULL,
	"parser_version" varchar(32),
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ingested_at" timestamp with time zone,
	"parsed_row_count" integer,
	"rejected_row_count" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(80),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutional_filings_manager_accession_unique" UNIQUE("manager_id","accession"),
	CONSTRAINT "institutional_filings_accession_valid" CHECK ("institutional_filings"."accession" ~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'),
	CONSTRAINT "institutional_filings_form_valid" CHECK ("institutional_filings"."form" in ('13F-HR', '13F-HR/A')),
	CONSTRAINT "institutional_filings_counts_nonnegative" CHECK ("institutional_filings"."rejected_row_count" >= 0 and ("institutional_filings"."parsed_row_count" is null or "institutional_filings"."parsed_row_count" >= 0))
);
--> statement-breakpoint
CREATE TABLE "institutional_manager_discovery" (
	"manager_id" bigint PRIMARY KEY NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"last_error_code" varchar(80),
	"lease_token" varchar(128),
	"lease_expires_at" timestamp with time zone,
	"worker_id" varchar(128),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutional_manager_discovery_status_valid" CHECK ("institutional_manager_discovery"."status" in ('PENDING', 'RUNNING', 'READY', 'ERROR')),
	CONSTRAINT "institutional_manager_discovery_lease_consistent" CHECK (("institutional_manager_discovery"."lease_token" is null and "institutional_manager_discovery"."lease_expires_at" is null and "institutional_manager_discovery"."worker_id" is null) or ("institutional_manager_discovery"."lease_token" is not null and "institutional_manager_discovery"."lease_expires_at" is not null and "institutional_manager_discovery"."worker_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "sec_request_scheduler_state" (
	"singleton" integer PRIMARY KEY NOT NULL,
	"next_allowed_at" timestamp with time zone NOT NULL,
	"request_count" bigint DEFAULT 0 NOT NULL,
	"failure_count" bigint DEFAULT 0 NOT NULL,
	"last_request_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sec_request_scheduler_singleton_check" CHECK ("sec_request_scheduler_state"."singleton" = 1),
	CONSTRAINT "sec_request_scheduler_counts_nonnegative" CHECK ("sec_request_scheduler_state"."request_count" >= 0 and "sec_request_scheduler_state"."failure_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "institutional_13f_holdings" ADD CONSTRAINT "institutional_13f_holdings_filing_id_institutional_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."institutional_filings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_13f_holdings" ADD CONSTRAINT "institutional_13f_holdings_document_id_institutional_filing_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."institutional_filing_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_13f_holdings" ADD CONSTRAINT "institutional_13f_holdings_artifact_id_institutional_filing_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."institutional_filing_artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_filing_artifacts" ADD CONSTRAINT "institutional_filing_artifacts_document_id_institutional_filing_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."institutional_filing_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_filing_artifacts" ADD CONSTRAINT "institutional_filing_artifacts_supersedes_artifact_id_institutional_filing_artifacts_id_fk" FOREIGN KEY ("supersedes_artifact_id") REFERENCES "public"."institutional_filing_artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_filing_documents" ADD CONSTRAINT "institutional_filing_documents_filing_id_institutional_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."institutional_filings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_filings" ADD CONSTRAINT "institutional_filings_manager_id_institutional_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."institutional_managers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_manager_discovery" ADD CONSTRAINT "institutional_manager_discovery_manager_id_institutional_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."institutional_managers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "institutional_13f_holdings_filing_idx" ON "institutional_13f_holdings" USING btree ("filing_id","row_number");--> statement-breakpoint
CREATE INDEX "institutional_13f_holdings_cusip_idx" ON "institutional_13f_holdings" USING btree ("cusip");--> statement-breakpoint
CREATE INDEX "institutional_filing_artifacts_document_time_idx" ON "institutional_filing_artifacts" USING btree ("document_id","fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "institutional_filings_period_idx" ON "institutional_filings" USING btree ("manager_id","period_end","filing_date");--> statement-breakpoint
CREATE INDEX "institutional_filings_status_idx" ON "institutional_filings" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "institutional_manager_discovery_due_idx" ON "institutional_manager_discovery" USING btree ("next_check_at","manager_id");