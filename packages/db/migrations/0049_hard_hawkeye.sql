CREATE TYPE "public"."institutional_holding_mapping_status" AS ENUM('MATCHED', 'AMBIGUOUS', 'UNRESOLVED', 'MANUAL_OVERRIDE');--> statement-breakpoint
CREATE TYPE "public"."institutional_security_identifier_type" AS ENUM('CUSIP', 'FIGI', 'TICKER');--> statement-breakpoint
CREATE TYPE "public"."institutional_security_identity_event_type" AS ENUM('TICKER_CHANGE', 'MERGER', 'SPIN_OFF', 'DELISTING', 'STOCK_SPLIT', 'SHARE_CLASS_CONTINUITY');--> statement-breakpoint
CREATE TYPE "public"."institutional_security_status" AS ENUM('ACTIVE', 'DELISTED');--> statement-breakpoint
CREATE TABLE "institutional_holding_security_mappings" (
	"holding_id" bigint PRIMARY KEY NOT NULL,
	"status" "institutional_holding_mapping_status" NOT NULL,
	"security_id" bigint,
	"reason" varchar(80) NOT NULL,
	"candidate_security_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"algorithm_version" varchar(40) NOT NULL,
	"resolved_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutional_holding_security_mappings_security_state" CHECK (("institutional_holding_security_mappings"."status" in ('MATCHED', 'MANUAL_OVERRIDE') and "institutional_holding_security_mappings"."security_id" is not null) or ("institutional_holding_security_mappings"."status" in ('AMBIGUOUS', 'UNRESOLVED') and "institutional_holding_security_mappings"."security_id" is null)),
	CONSTRAINT "institutional_holding_security_mappings_algorithm_nonempty" CHECK (length(btrim("institutional_holding_security_mappings"."algorithm_version")) > 0)
);
--> statement-breakpoint
CREATE TABLE "institutional_securities" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_securities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"issuer" text NOT NULL,
	"title_of_class" varchar(160) NOT NULL,
	"exchange" varchar(32),
	"security_type" varchar(80) NOT NULL,
	"sector" varchar(120),
	"industry" varchar(160),
	"status" "institutional_security_status" DEFAULT 'ACTIVE' NOT NULL,
	"source_url" varchar(2048) NOT NULL,
	"source_verified_by" bigint NOT NULL,
	"source_verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutional_securities_issuer_nonempty" CHECK (length(btrim("institutional_securities"."issuer")) > 0),
	CONSTRAINT "institutional_securities_title_nonempty" CHECK (length(btrim("institutional_securities"."title_of_class")) > 0),
	CONSTRAINT "institutional_securities_type_nonempty" CHECK (length(btrim("institutional_securities"."security_type")) > 0),
	CONSTRAINT "institutional_securities_source_https" CHECK ("institutional_securities"."source_url" like 'https://%')
);
--> statement-breakpoint
CREATE TABLE "institutional_security_identifiers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_security_identifiers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"security_id" bigint NOT NULL,
	"type" "institutional_security_identifier_type" NOT NULL,
	"value" varchar(32) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"source_url" varchar(2048) NOT NULL,
	"source_verified_by" bigint NOT NULL,
	"source_verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutional_security_identifiers_identity_unique" UNIQUE("security_id","type","value","valid_from"),
	CONSTRAINT "institutional_security_identifiers_value_nonempty" CHECK (length(btrim("institutional_security_identifiers"."value")) > 0),
	CONSTRAINT "institutional_security_identifiers_date_range_valid" CHECK ("institutional_security_identifiers"."valid_to" is null or "institutional_security_identifiers"."valid_to" >= "institutional_security_identifiers"."valid_from"),
	CONSTRAINT "institutional_security_identifiers_source_https" CHECK ("institutional_security_identifiers"."source_url" like 'https://%')
);
--> statement-breakpoint
CREATE TABLE "institutional_security_identity_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_security_identity_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" "institutional_security_identity_event_type" NOT NULL,
	"from_security_id" bigint NOT NULL,
	"to_security_id" bigint,
	"effective_on" date NOT NULL,
	"new_ticker" varchar(32),
	"new_shares_per_old_share" numeric(24, 12),
	"comparable" boolean NOT NULL,
	"reason" text NOT NULL,
	"evidence_url" varchar(2048) NOT NULL,
	"actor_user_id" bigint NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"supersedes_event_id" bigint,
	CONSTRAINT "institutional_security_identity_events_reason_nonempty" CHECK (length(btrim("institutional_security_identity_events"."reason")) > 0),
	CONSTRAINT "institutional_security_identity_events_source_https" CHECK ("institutional_security_identity_events"."evidence_url" like 'https://%'),
	CONSTRAINT "institutional_security_identity_events_semantics" CHECK (
    ("institutional_security_identity_events"."kind" = 'TICKER_CHANGE' and "institutional_security_identity_events"."to_security_id" = "institutional_security_identity_events"."from_security_id" and "institutional_security_identity_events"."new_ticker" is not null and "institutional_security_identity_events"."new_shares_per_old_share" is null and "institutional_security_identity_events"."comparable") or
    ("institutional_security_identity_events"."kind" = 'STOCK_SPLIT' and "institutional_security_identity_events"."to_security_id" = "institutional_security_identity_events"."from_security_id" and "institutional_security_identity_events"."new_ticker" is null and "institutional_security_identity_events"."new_shares_per_old_share" > 0 and "institutional_security_identity_events"."comparable") or
    ("institutional_security_identity_events"."kind" = 'SHARE_CLASS_CONTINUITY' and "institutional_security_identity_events"."to_security_id" is not null and "institutional_security_identity_events"."to_security_id" <> "institutional_security_identity_events"."from_security_id" and "institutional_security_identity_events"."new_ticker" is null and "institutional_security_identity_events"."new_shares_per_old_share" > 0 and "institutional_security_identity_events"."comparable") or
    ("institutional_security_identity_events"."kind" in ('MERGER', 'SPIN_OFF') and "institutional_security_identity_events"."to_security_id" is not null and "institutional_security_identity_events"."to_security_id" <> "institutional_security_identity_events"."from_security_id" and "institutional_security_identity_events"."new_ticker" is null and "institutional_security_identity_events"."new_shares_per_old_share" is null and not "institutional_security_identity_events"."comparable") or
    ("institutional_security_identity_events"."kind" = 'DELISTING' and "institutional_security_identity_events"."to_security_id" is null and "institutional_security_identity_events"."new_ticker" is null and "institutional_security_identity_events"."new_shares_per_old_share" is null and not "institutional_security_identity_events"."comparable")
  )
);
--> statement-breakpoint
CREATE TABLE "institutional_security_mapping_overrides" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_security_mapping_overrides_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"holding_id" bigint NOT NULL,
	"security_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"actor_user_id" bigint NOT NULL,
	"reason" text NOT NULL,
	"evidence_url" varchar(2048) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"supersedes_override_id" bigint,
	CONSTRAINT "institutional_security_mapping_overrides_version_unique" UNIQUE("holding_id","version"),
	CONSTRAINT "institutional_security_mapping_overrides_version_positive" CHECK ("institutional_security_mapping_overrides"."version" > 0),
	CONSTRAINT "institutional_security_mapping_overrides_reason_nonempty" CHECK (length(btrim("institutional_security_mapping_overrides"."reason")) > 0),
	CONSTRAINT "institutional_security_mapping_overrides_source_https" CHECK ("institutional_security_mapping_overrides"."evidence_url" like 'https://%')
);
--> statement-breakpoint
ALTER TABLE "institutional_holding_security_mappings" ADD CONSTRAINT "institutional_holding_security_mappings_holding_id_institutional_13f_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."institutional_13f_holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_holding_security_mappings" ADD CONSTRAINT "institutional_holding_security_mappings_security_id_institutional_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_security_identifiers" ADD CONSTRAINT "institutional_security_identifiers_security_id_institutional_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_security_identity_events" ADD CONSTRAINT "institutional_security_identity_events_from_security_id_institutional_securities_id_fk" FOREIGN KEY ("from_security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_security_identity_events" ADD CONSTRAINT "institutional_security_identity_events_to_security_id_institutional_securities_id_fk" FOREIGN KEY ("to_security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_security_identity_events" ADD CONSTRAINT "institutional_security_identity_events_supersedes_event_id_institutional_security_identity_events_id_fk" FOREIGN KEY ("supersedes_event_id") REFERENCES "public"."institutional_security_identity_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_security_mapping_overrides" ADD CONSTRAINT "institutional_security_mapping_overrides_holding_id_institutional_13f_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."institutional_13f_holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_security_mapping_overrides" ADD CONSTRAINT "institutional_security_mapping_overrides_security_id_institutional_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutional_security_mapping_overrides" ADD CONSTRAINT "institutional_security_mapping_overrides_supersedes_override_id_institutional_security_mapping_overrides_id_fk" FOREIGN KEY ("supersedes_override_id") REFERENCES "public"."institutional_security_mapping_overrides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "institutional_holding_security_mappings_security_idx" ON "institutional_holding_security_mappings" USING btree ("security_id","status");--> statement-breakpoint
CREATE INDEX "institutional_holding_security_mappings_status_idx" ON "institutional_holding_security_mappings" USING btree ("status","resolved_at");--> statement-breakpoint
CREATE INDEX "institutional_securities_search_idx" ON "institutional_securities" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "institutional_security_identifiers_lookup_idx" ON "institutional_security_identifiers" USING btree ("type","value","valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "institutional_security_identifiers_security_idx" ON "institutional_security_identifiers" USING btree ("security_id","type","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_security_identity_events_supersedes_unique" ON "institutional_security_identity_events" USING btree ("supersedes_event_id") WHERE "institutional_security_identity_events"."supersedes_event_id" is not null;--> statement-breakpoint
CREATE INDEX "institutional_security_identity_events_from_idx" ON "institutional_security_identity_events" USING btree ("from_security_id","effective_on","id");--> statement-breakpoint
CREATE INDEX "institutional_security_identity_events_to_idx" ON "institutional_security_identity_events" USING btree ("to_security_id","effective_on","id");--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_security_mapping_overrides_supersedes_unique" ON "institutional_security_mapping_overrides" USING btree ("supersedes_override_id") WHERE "institutional_security_mapping_overrides"."supersedes_override_id" is not null;--> statement-breakpoint
CREATE INDEX "institutional_security_mapping_overrides_holding_time_idx" ON "institutional_security_mapping_overrides" USING btree ("holding_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE FUNCTION reject_institutional_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Institutional audit records are append-only' USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER institutional_security_mapping_overrides_immutable
BEFORE UPDATE OR DELETE ON institutional_security_mapping_overrides
FOR EACH ROW EXECUTE FUNCTION reject_institutional_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER institutional_security_identity_events_immutable
BEFORE UPDATE OR DELETE ON institutional_security_identity_events
FOR EACH ROW EXECUTE FUNCTION reject_institutional_audit_mutation();
