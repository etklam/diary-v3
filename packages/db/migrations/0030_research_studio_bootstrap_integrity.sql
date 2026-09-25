ALTER TABLE "research_provider_config" ALTER COLUMN "max_input_tokens" SET DEFAULT 64000;--> statement-breakpoint
ALTER TABLE "research_revision" ADD COLUMN "title_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "research_revision" ADD CONSTRAINT "research_revision_title_hash_shape" CHECK ("research_revision"."title_hash" is null or "research_revision"."title_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
UPDATE "research_revision" SET "approved_by_snapshot" = "approved_by" WHERE "review_status" = 'APPROVED' AND "approved_by_snapshot" IS NULL;--> statement-breakpoint
UPDATE "research_budget_session" SET "dispatch_limit" = 3, "reserved" = 0, "consumed" = 2, "unknown" = 1 WHERE "budget_key" = 'live-test';--> statement-breakpoint
UPDATE "research_method_profile" SET
  "status" = 'COMPLETE',
  "bundle_hash" = 'de390feff2b8e7b7848bb89160e5c98a412c5bf637ea163d7e17c3db0f19cbdc',
  "requirements_json" = '{"targetSessions":400,"minimumCloses":260,"minimumCompleteOhlc":150,"minimumVolumeRows":21,"minimumCompletedWeeks":34,"bundleDocuments":8,"strictEvidenceReferences":true}',
  "coverage_manifest_json" = '{"complete":true,"main":"b1f19ed0f868af148ade0ed0b06383e53e013a119fb222b539e9b3eed8fc10be","appendices":{"01-data-sources":"fb8a3f93609fc13850319d1f47b4cd37df712cc3f4431722b046625fd4290026","02-data-contract":"6d7ef9eb4feb21b32b3caf03d8cd3ffe8b632ce868c29d7bf6720e366fd30321","03-indicator-spec":"0d1eefc9fee334555931beaaf52cb27d4cf464732a9b75ea896e1a90e24de5bf","04-analysis-and-trades":"5e91b57a19fc22078b9142f8221b5e6bc5136fba728a5b36286b6bcd3bc89367","05-news-and-events":"c9a00bf4ce9303a6028b5239ab079965845c7204b82d51b8de634e5c81dc5f3a","06-report-and-qa":"12b5a6e55bcba465aeb4e28857c3637c8bf8befd908801ec5b266a6b1813fbdf","07-runbook":"5aac4a7e23ed998dd3f280145a4a1fe606f03852fc6f60dbcf2f7071d400d4"},"calculator":"ts-research-calculator-1.0.0","templates":false,"originalPythonTests":false}'
WHERE "method_key" = 'us-equity-swing-report' AND "version" = '1.0.0';--> statement-breakpoint
UPDATE "research_provider_config" SET "max_input_tokens" = 64000 WHERE "max_input_tokens" = 16000;
