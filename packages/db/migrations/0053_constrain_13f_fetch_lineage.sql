ALTER TABLE "institutional_filing_artifacts" ADD CONSTRAINT "institutional_filing_artifacts_id_document_unique" UNIQUE("id","document_id");
--> statement-breakpoint
ALTER TABLE "institutional_filing_artifact_fetches" DROP CONSTRAINT "institutional_filing_artifact_fetches_source_artifact_id_institutional_filing_artifacts_id_fk";
--> statement-breakpoint
ALTER TABLE "institutional_filing_artifact_fetches" DROP CONSTRAINT "institutional_filing_artifact_fetches_artifact_id_institutional_filing_artifacts_id_fk";
--> statement-breakpoint
ALTER TABLE "institutional_filing_artifact_fetches" ADD CONSTRAINT "institutional_filing_artifact_fetches_source_document_fk" FOREIGN KEY ("source_artifact_id","document_id") REFERENCES "public"."institutional_filing_artifacts"("id","document_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_filing_artifact_fetches" ADD CONSTRAINT "institutional_filing_artifact_fetches_result_document_fk" FOREIGN KEY ("artifact_id","document_id") REFERENCES "public"."institutional_filing_artifacts"("id","document_id") ON DELETE restrict ON UPDATE no action;
