CREATE TABLE "institutional_effective_holdings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_effective_holdings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"snapshot_id" bigint NOT NULL,
	"ordinal" integer NOT NULL,
	"source_filing_id" bigint NOT NULL,
	"source_document_id" bigint NOT NULL,
	"source_artifact_id" bigint NOT NULL,
	"source_row_key" varchar(64) NOT NULL,
	"source_row_number" integer NOT NULL,
	"security_id" bigint,
	"mapping_status" "institutional_holding_mapping_status" NOT NULL,
	"mapping_version" varchar(40) NOT NULL,
	"issuer" text NOT NULL,
	"title_of_class" varchar(160) NOT NULL,
	"cusip" varchar(32),
	"figi" varchar(32),
	"reported_value" numeric(32, 8) NOT NULL,
	"reported_value_unit" varchar(32) NOT NULL,
	"quantity" numeric(32, 8) NOT NULL,
	"quantity_type" varchar(8) NOT NULL,
	"put_call" varchar(8),
	"source_data" jsonb NOT NULL,
	CONSTRAINT "institutional_effective_holdings_ordinal_unique" UNIQUE("snapshot_id","ordinal"),
	CONSTRAINT "institutional_effective_holdings_source_row_unique" UNIQUE("snapshot_id","source_row_key"),
	CONSTRAINT "institutional_effective_holdings_row_valid" CHECK ("institutional_effective_holdings"."ordinal" >= 0 and "institutional_effective_holdings"."source_row_number" > 0 and "institutional_effective_holdings"."source_row_key" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "institutional_effective_holdings_quantity_valid" CHECK ("institutional_effective_holdings"."reported_value" >= 0 and "institutional_effective_holdings"."quantity" >= 0 and "institutional_effective_holdings"."quantity_type" in ('SH', 'PRN')),
	CONSTRAINT "institutional_effective_holdings_mapping_valid" CHECK (("institutional_effective_holdings"."mapping_status" in ('MATCHED', 'MANUAL_OVERRIDE') and "institutional_effective_holdings"."security_id" is not null) or ("institutional_effective_holdings"."mapping_status" in ('AMBIGUOUS', 'UNRESOLVED') and "institutional_effective_holdings"."security_id" is null))
);
--> statement-breakpoint
CREATE TABLE "institutional_effective_period_states" (
	"manager_id" bigint NOT NULL,
	"period_end" date NOT NULL,
	"status" varchar(16) NOT NULL,
	"reason" varchar(80),
	"source_manifest_hash" varchar(64) NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "institutional_effective_period_states_manager_id_period_end_pk" PRIMARY KEY("manager_id","period_end"),
	CONSTRAINT "institutional_effective_period_states_status_valid" CHECK ("institutional_effective_period_states"."status" in ('READY', 'PARTIAL', 'ERROR')),
	CONSTRAINT "institutional_effective_period_states_reason_valid" CHECK (("institutional_effective_period_states"."status" = 'READY' and "institutional_effective_period_states"."reason" is null) or ("institutional_effective_period_states"."status" <> 'READY' and "institutional_effective_period_states"."reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "institutional_effective_snapshot_publications" (
	"snapshot_id" bigint PRIMARY KEY NOT NULL,
	"manager_id" bigint NOT NULL,
	"period_end" date NOT NULL,
	"status" varchar(16) NOT NULL,
	"active" boolean NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "institutional_effective_snapshot_publications_state_valid" CHECK (("institutional_effective_snapshot_publications"."active" and "institutional_effective_snapshot_publications"."status" = 'READY') or (not "institutional_effective_snapshot_publications"."active" and "institutional_effective_snapshot_publications"."status" = 'SUPERSEDED'))
);
--> statement-breakpoint
CREATE TABLE "institutional_effective_snapshot_sources" (
	"snapshot_id" bigint NOT NULL,
	"ordinal" integer NOT NULL,
	"filing_id" bigint NOT NULL,
	"accession" varchar(20) NOT NULL,
	"operation" varchar(24) NOT NULL,
	"amendment_number" integer,
	"parser_version" varchar(32) NOT NULL,
	"source_manifest" jsonb NOT NULL,
	CONSTRAINT "institutional_effective_snapshot_sources_snapshot_id_ordinal_pk" PRIMARY KEY("snapshot_id","ordinal"),
	CONSTRAINT "institutional_effective_snapshot_sources_filing_unique" UNIQUE("snapshot_id","filing_id"),
	CONSTRAINT "institutional_effective_snapshot_sources_operation_valid" CHECK (("institutional_effective_snapshot_sources"."operation" = 'ORIGINAL' and "institutional_effective_snapshot_sources"."amendment_number" is null) or ("institutional_effective_snapshot_sources"."operation" in ('RESTATEMENT', 'ADD_NEW_HOLDINGS') and "institutional_effective_snapshot_sources"."amendment_number" > 0)),
	CONSTRAINT "institutional_effective_snapshot_sources_ordinal_nonnegative" CHECK ("institutional_effective_snapshot_sources"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "institutional_effective_snapshots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_effective_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"manager_id" bigint NOT NULL,
	"period_end" date NOT NULL,
	"replay_key" varchar(64) NOT NULL,
	"snapshot_hash" varchar(64) NOT NULL,
	"source_manifest_hash" varchar(64) NOT NULL,
	"resolver_version" varchar(40) NOT NULL,
	"holding_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "institutional_effective_snapshots_replay_unique" UNIQUE("manager_id","period_end","replay_key"),
	CONSTRAINT "institutional_effective_snapshots_identity_unique" UNIQUE("id","manager_id","period_end"),
	CONSTRAINT "institutional_effective_snapshots_hash_valid" CHECK ("institutional_effective_snapshots"."replay_key" ~ '^[a-f0-9]{64}$' and "institutional_effective_snapshots"."snapshot_hash" ~ '^[a-f0-9]{64}$' and "institutional_effective_snapshots"."source_manifest_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "institutional_effective_snapshots_count_nonnegative" CHECK ("institutional_effective_snapshots"."holding_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "institutional_snapshot_change_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_snapshot_change_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"manager_id" bigint NOT NULL,
	"period_end" date NOT NULL,
	"snapshot_id" bigint NOT NULL,
	"previous_snapshot_id" bigint,
	"event_type" varchar(32) DEFAULT 'EFFECTIVE_SNAPSHOT_CHANGED' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "institutional_snapshot_change_events_type_valid" CHECK ("institutional_snapshot_change_events"."event_type" = 'EFFECTIVE_SNAPSHOT_CHANGED'),
	CONSTRAINT "institutional_snapshot_change_events_distinct" CHECK ("institutional_snapshot_change_events"."previous_snapshot_id" is null or "institutional_snapshot_change_events"."previous_snapshot_id" <> "institutional_snapshot_change_events"."snapshot_id")
);
--> statement-breakpoint
ALTER TABLE "institutional_effective_holdings" ADD CONSTRAINT "institutional_effective_holdings_snapshot_id_institutional_effective_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."institutional_effective_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_effective_holdings" ADD CONSTRAINT "institutional_effective_holdings_source_filing_id_institutional_filings_id_fk" FOREIGN KEY ("source_filing_id") REFERENCES "public"."institutional_filings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_effective_holdings" ADD CONSTRAINT "institutional_effective_holdings_source_document_id_institutional_filing_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."institutional_filing_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_effective_holdings" ADD CONSTRAINT "institutional_effective_holdings_source_artifact_id_institutional_filing_artifacts_id_fk" FOREIGN KEY ("source_artifact_id") REFERENCES "public"."institutional_filing_artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_effective_holdings" ADD CONSTRAINT "institutional_effective_holdings_security_id_institutional_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_effective_period_states" ADD CONSTRAINT "institutional_effective_period_states_manager_id_institutional_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."institutional_managers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_effective_snapshot_publications" ADD CONSTRAINT "institutional_effective_snapshot_publications_snapshot_id_manager_id_period_end_institutional_effective_snapshots_id_manager_id_period_end_fk" FOREIGN KEY ("snapshot_id","manager_id","period_end") REFERENCES "public"."institutional_effective_snapshots"("id","manager_id","period_end") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_effective_snapshot_sources" ADD CONSTRAINT "institutional_effective_snapshot_sources_snapshot_id_institutional_effective_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."institutional_effective_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_effective_snapshot_sources" ADD CONSTRAINT "institutional_effective_snapshot_sources_filing_id_institutional_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."institutional_filings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_effective_snapshots" ADD CONSTRAINT "institutional_effective_snapshots_manager_id_institutional_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."institutional_managers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_snapshot_change_events" ADD CONSTRAINT "institutional_snapshot_change_events_snapshot_id_manager_id_period_end_institutional_effective_snapshots_id_manager_id_period_end_fk" FOREIGN KEY ("snapshot_id","manager_id","period_end") REFERENCES "public"."institutional_effective_snapshots"("id","manager_id","period_end") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_snapshot_change_events" ADD CONSTRAINT "institutional_snapshot_change_events_previous_snapshot_id_manager_id_period_end_institutional_effective_snapshots_id_manager_id_period_end_fk" FOREIGN KEY ("previous_snapshot_id","manager_id","period_end") REFERENCES "public"."institutional_effective_snapshots"("id","manager_id","period_end") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_effective_snapshot_publications_active_unique" ON "institutional_effective_snapshot_publications" USING btree ("manager_id","period_end") WHERE "institutional_effective_snapshot_publications"."active" and "institutional_effective_snapshot_publications"."status" = 'READY';--> statement-breakpoint
CREATE INDEX "institutional_snapshot_change_events_delivery_idx" ON "institutional_snapshot_change_events" USING btree ("id","manager_id","period_end");
--> statement-breakpoint
CREATE TRIGGER institutional_effective_snapshots_immutable
BEFORE UPDATE OR DELETE ON institutional_effective_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_institutional_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER institutional_effective_snapshot_sources_immutable
BEFORE UPDATE OR DELETE ON institutional_effective_snapshot_sources
FOR EACH ROW EXECUTE FUNCTION reject_institutional_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER institutional_effective_holdings_immutable
BEFORE UPDATE OR DELETE ON institutional_effective_holdings
FOR EACH ROW EXECUTE FUNCTION reject_institutional_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER institutional_snapshot_change_events_immutable
BEFORE UPDATE OR DELETE ON institutional_snapshot_change_events
FOR EACH ROW EXECUTE FUNCTION reject_institutional_audit_mutation();
