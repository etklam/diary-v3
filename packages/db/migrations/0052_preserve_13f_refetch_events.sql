CREATE TABLE "institutional_filing_artifact_fetches" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_filing_artifact_fetches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"document_id" bigint NOT NULL,
	"source_artifact_id" bigint NOT NULL,
	"artifact_id" bigint NOT NULL,
	"operation_key" varchar(128) NOT NULL,
	"content_sha256" varchar(64) NOT NULL,
	"source_url" varchar(2048) NOT NULL,
	"content_length" bigint NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"fetched_reason" varchar(24) DEFAULT 'reprocess-refetch' NOT NULL,
	CONSTRAINT "institutional_filing_artifact_fetches_operation_key_unique" UNIQUE("operation_key"),
	CONSTRAINT "institutional_filing_artifact_fetches_digest_valid" CHECK ("institutional_filing_artifact_fetches"."content_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "institutional_filing_artifact_fetches_source_https" CHECK ("institutional_filing_artifact_fetches"."source_url" like 'https://%'),
	CONSTRAINT "institutional_filing_artifact_fetches_length_nonnegative" CHECK ("institutional_filing_artifact_fetches"."content_length" >= 0),
	CONSTRAINT "institutional_filing_artifact_fetches_reason_valid" CHECK ("institutional_filing_artifact_fetches"."fetched_reason" = 'reprocess-refetch'),
	CONSTRAINT "institutional_filing_artifact_fetches_operation_key_nonempty" CHECK (length(btrim("institutional_filing_artifact_fetches"."operation_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "institutional_filing_artifact_fetches" ADD CONSTRAINT "institutional_filing_artifact_fetches_document_id_institutional_filing_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."institutional_filing_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_filing_artifact_fetches" ADD CONSTRAINT "institutional_filing_artifact_fetches_source_artifact_id_institutional_filing_artifacts_id_fk" FOREIGN KEY ("source_artifact_id") REFERENCES "public"."institutional_filing_artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_filing_artifact_fetches" ADD CONSTRAINT "institutional_filing_artifact_fetches_artifact_id_institutional_filing_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."institutional_filing_artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "institutional_filing_artifact_fetches_document_time_idx" ON "institutional_filing_artifact_fetches" USING btree ("document_id","fetched_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE TRIGGER institutional_filing_artifact_fetches_immutable
BEFORE UPDATE OR DELETE ON institutional_filing_artifact_fetches
FOR EACH ROW EXECUTE FUNCTION reject_institutional_audit_mutation();
