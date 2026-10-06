CREATE TABLE "guru_consensus_rebuild_requests" (
	"period_end" date PRIMARY KEY NOT NULL,
	"requested_revision" bigint DEFAULT 1 NOT NULL,
	"processed_revision" bigint DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_error" varchar(96),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guru_consensus_rebuild_requests_revision_valid" CHECK ("guru_consensus_rebuild_requests"."requested_revision" > 0 and "guru_consensus_rebuild_requests"."processed_revision" >= 0 and "guru_consensus_rebuild_requests"."processed_revision" <= "guru_consensus_rebuild_requests"."requested_revision"),
	CONSTRAINT "guru_consensus_rebuild_requests_attempt_valid" CHECK ("guru_consensus_rebuild_requests"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "guru_consensus_snapshots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "guru_consensus_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"period_end" date NOT NULL,
	"consensus_version" varchar(40) NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"context_hash" varchar(64) NOT NULL,
	"theme_mapping_hash" varchar(64) NOT NULL,
	"active_manager_count" integer NOT NULL,
	"ready_manager_count" integer NOT NULL,
	"partial_manager_count" integer NOT NULL,
	"error_manager_count" integer NOT NULL,
	"superseded_manager_count" integer NOT NULL,
	"pending_manager_count" integer NOT NULL,
	"no_filing_manager_count" integer NOT NULL,
	"comparable_manager_count" integer NOT NULL,
	"previous_ready_manager_count" integer NOT NULL,
	"source_row_count" integer NOT NULL,
	"mapped_row_count" integer NOT NULL,
	"mapping_coverage_percent" numeric(12, 8),
	"calculated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "guru_consensus_snapshots_period_version_unique" UNIQUE("period_end","consensus_version"),
	CONSTRAINT "guru_consensus_snapshots_hash_valid" CHECK ("guru_consensus_snapshots"."input_hash" ~ '^[a-f0-9]{64}$' and "guru_consensus_snapshots"."context_hash" ~ '^[a-f0-9]{64}$' and "guru_consensus_snapshots"."theme_mapping_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "guru_consensus_snapshots_counts_valid" CHECK ("guru_consensus_snapshots"."active_manager_count" >= 0 and "guru_consensus_snapshots"."ready_manager_count" >= 0 and "guru_consensus_snapshots"."partial_manager_count" >= 0 and "guru_consensus_snapshots"."error_manager_count" >= 0 and "guru_consensus_snapshots"."superseded_manager_count" >= 0 and "guru_consensus_snapshots"."pending_manager_count" >= 0 and "guru_consensus_snapshots"."no_filing_manager_count" >= 0 and "guru_consensus_snapshots"."comparable_manager_count" >= 0 and "guru_consensus_snapshots"."previous_ready_manager_count" >= 0 and "guru_consensus_snapshots"."source_row_count" >= 0 and "guru_consensus_snapshots"."mapped_row_count" >= 0 and "guru_consensus_snapshots"."mapped_row_count" <= "guru_consensus_snapshots"."source_row_count"),
	CONSTRAINT "guru_consensus_snapshots_coverage_valid" CHECK ("guru_consensus_snapshots"."mapping_coverage_percent" is null or "guru_consensus_snapshots"."mapping_coverage_percent" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "guru_sector_consensus" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "guru_sector_consensus_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"snapshot_id" bigint NOT NULL,
	"dimension" varchar(16) NOT NULL,
	"dimension_key" varchar(160) NOT NULL,
	"name" varchar(160) NOT NULL,
	"current_holder_count" integer NOT NULL,
	"buyer_count" integer NOT NULL,
	"seller_count" integer NOT NULL,
	"new_position_count" integer NOT NULL,
	"exit_count" integer NOT NULL,
	"add_count" integer NOT NULL,
	"reduce_count" integer NOT NULL,
	"allocation_manager_count" integer NOT NULL,
	"aggregate_weight_percent" numeric(20, 8) NOT NULL,
	"comparable_current_aggregate_weight_percent" numeric(20, 8) NOT NULL,
	"previous_aggregate_weight_percent" numeric(20, 8),
	"aggregate_weight_change_points" numeric(20, 8),
	"holder_breadth_percent" numeric(12, 8) NOT NULL,
	"allocation_coverage_percent" numeric(12, 8) NOT NULL,
	"direction" varchar(16),
	CONSTRAINT "guru_sector_consensus_snapshot_dimension_key_unique" UNIQUE("snapshot_id","dimension","dimension_key"),
	CONSTRAINT "guru_sector_consensus_dimension_valid" CHECK ("guru_sector_consensus"."dimension" in ('SECTOR', 'INDUSTRY', 'THEME')),
	CONSTRAINT "guru_sector_consensus_counts_valid" CHECK ("guru_sector_consensus"."current_holder_count" >= 0 and "guru_sector_consensus"."buyer_count" >= 0 and "guru_sector_consensus"."seller_count" >= 0 and "guru_sector_consensus"."new_position_count" >= 0 and "guru_sector_consensus"."exit_count" >= 0 and "guru_sector_consensus"."add_count" >= 0 and "guru_sector_consensus"."reduce_count" >= 0 and "guru_sector_consensus"."allocation_manager_count" >= 0),
	CONSTRAINT "guru_sector_consensus_direction_valid" CHECK ("guru_sector_consensus"."direction" is null or "guru_sector_consensus"."direction" in ('INCREASING', 'STABLE', 'REDUCING')),
	CONSTRAINT "guru_sector_consensus_coverage_valid" CHECK ("guru_sector_consensus"."holder_breadth_percent" between 0 and 100 and "guru_sector_consensus"."allocation_coverage_percent" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "guru_stock_consensus" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "guru_stock_consensus_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"snapshot_id" bigint NOT NULL,
	"security_id" bigint NOT NULL,
	"ticker" varchar(32),
	"company" text NOT NULL,
	"sector" varchar(120),
	"industry" varchar(160),
	"current_holder_count" integer NOT NULL,
	"comparable_current_holder_count" integer NOT NULL,
	"previous_holder_count" integer NOT NULL,
	"holder_count_change" integer NOT NULL,
	"new_buyer_count" integer NOT NULL,
	"add_count" integer NOT NULL,
	"unchanged_count" integer NOT NULL,
	"reduce_count" integer NOT NULL,
	"exit_count" integer NOT NULL,
	"net_buyer_count" integer NOT NULL,
	"action_manager_count" integer NOT NULL,
	"quantity_change_sample_count" integer NOT NULL,
	"average_quantity_change_percent" numeric(20, 8),
	"median_quantity_change_percent" numeric(20, 8),
	"aggregate_weight_percent" numeric(20, 8) NOT NULL,
	"average_portfolio_weight_percent" numeric(20, 8),
	"weight_breadth_percent" numeric(12, 8) NOT NULL,
	"classification" varchar(20),
	"quarter_trend" varchar(20) NOT NULL,
	CONSTRAINT "guru_stock_consensus_snapshot_security_unique" UNIQUE("snapshot_id","security_id"),
	CONSTRAINT "guru_stock_consensus_counts_valid" CHECK ("guru_stock_consensus"."current_holder_count" >= 0 and "guru_stock_consensus"."comparable_current_holder_count" >= 0 and "guru_stock_consensus"."previous_holder_count" >= 0 and "guru_stock_consensus"."new_buyer_count" >= 0 and "guru_stock_consensus"."add_count" >= 0 and "guru_stock_consensus"."unchanged_count" >= 0 and "guru_stock_consensus"."reduce_count" >= 0 and "guru_stock_consensus"."exit_count" >= 0 and "guru_stock_consensus"."action_manager_count" >= 0 and "guru_stock_consensus"."quantity_change_sample_count" >= 0),
	CONSTRAINT "guru_stock_consensus_classification_valid" CHECK ("guru_stock_consensus"."classification" is null or "guru_stock_consensus"."classification" in ('ACCUMULATION', 'NEUTRAL', 'DISTRIBUTION')),
	CONSTRAINT "guru_stock_consensus_trend_valid" CHECK ("guru_stock_consensus"."quarter_trend" in ('RISING', 'STABLE', 'FALLING', 'UNAVAILABLE'))
);
--> statement-breakpoint
CREATE TABLE "guru_theme_mappings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "guru_theme_mappings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"security_id" bigint NOT NULL,
	"theme_key" varchar(80) NOT NULL,
	"theme_name" varchar(120) NOT NULL,
	"version" integer NOT NULL,
	"source" varchar(32) NOT NULL,
	"source_reference" varchar(500),
	"active" boolean DEFAULT true NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guru_theme_mappings_security_theme_version_unique" UNIQUE("security_id","theme_key","version"),
	CONSTRAINT "guru_theme_mappings_theme_key_valid" CHECK ("guru_theme_mappings"."theme_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "guru_theme_mappings_name_nonempty" CHECK (length(btrim("guru_theme_mappings"."theme_name")) > 0),
	CONSTRAINT "guru_theme_mappings_version_positive" CHECK ("guru_theme_mappings"."version" > 0),
	CONSTRAINT "guru_theme_mappings_source_valid" CHECK ("guru_theme_mappings"."source" in ('ADMIN', 'RESEARCH_METADATA'))
);
--> statement-breakpoint
ALTER TABLE "guru_sector_consensus" ADD CONSTRAINT "guru_sector_consensus_snapshot_id_guru_consensus_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."guru_consensus_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_stock_consensus" ADD CONSTRAINT "guru_stock_consensus_snapshot_id_guru_consensus_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."guru_consensus_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_stock_consensus" ADD CONSTRAINT "guru_stock_consensus_security_id_institutional_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_theme_mappings" ADD CONSTRAINT "guru_theme_mappings_security_id_institutional_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_theme_mappings" ADD CONSTRAINT "guru_theme_mappings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guru_consensus_rebuild_requests_due_idx" ON "guru_consensus_rebuild_requests" USING btree ("processed_revision","next_attempt_at","period_end");--> statement-breakpoint
CREATE INDEX "guru_consensus_snapshots_period_idx" ON "guru_consensus_snapshots" USING btree ("period_end" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "guru_sector_consensus_dimension_idx" ON "guru_sector_consensus" USING btree ("snapshot_id","dimension","name");--> statement-breakpoint
CREATE INDEX "guru_sector_consensus_direction_idx" ON "guru_sector_consensus" USING btree ("snapshot_id","dimension","direction");--> statement-breakpoint
CREATE INDEX "guru_stock_consensus_holders_idx" ON "guru_stock_consensus" USING btree ("snapshot_id","current_holder_count" DESC NULLS LAST,"ticker");--> statement-breakpoint
CREATE INDEX "guru_stock_consensus_net_buyers_idx" ON "guru_stock_consensus" USING btree ("snapshot_id","net_buyer_count" DESC NULLS LAST,"current_holder_count" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "guru_stock_consensus_exits_idx" ON "guru_stock_consensus" USING btree ("snapshot_id","exit_count" DESC NULLS LAST,"current_holder_count" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "guru_stock_consensus_weight_idx" ON "guru_stock_consensus" USING btree ("snapshot_id","aggregate_weight_percent" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "guru_stock_consensus_holder_change_idx" ON "guru_stock_consensus" USING btree ("snapshot_id","holder_count_change" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "guru_theme_mappings_active_unique" ON "guru_theme_mappings" USING btree ("security_id","theme_key") WHERE "guru_theme_mappings"."active";--> statement-breakpoint
CREATE INDEX "guru_theme_mappings_active_theme_idx" ON "guru_theme_mappings" USING btree ("active","theme_key","security_id");--> statement-breakpoint
CREATE FUNCTION guru_consensus_enqueue_period(p_period_end date) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO guru_consensus_rebuild_requests (period_end, requested_revision, processed_revision, attempt_count, next_attempt_at, updated_at)
  VALUES (p_period_end, 1, 0, 0, now(), now())
  ON CONFLICT (period_end) DO UPDATE SET
    requested_revision = guru_consensus_rebuild_requests.requested_revision + 1,
    attempt_count = 0,
    next_attempt_at = now(),
    last_error = NULL,
    updated_at = now();
END;
$$;--> statement-breakpoint
CREATE FUNCTION guru_consensus_enqueue_all_periods() RETURNS void LANGUAGE plpgsql AS $$
DECLARE period_row record;
BEGIN
  FOR period_row IN
    SELECT period_end FROM institutional_filings WHERE period_end IS NOT NULL
    UNION
    SELECT period_end FROM guru_quarter_analytics
  LOOP
    PERFORM guru_consensus_enqueue_period(period_row.period_end);
  END LOOP;
END;
$$;--> statement-breakpoint
CREATE FUNCTION guru_consensus_on_analytics_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM guru_consensus_enqueue_period(NEW.period_end);
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER guru_consensus_analytics_change
AFTER INSERT OR UPDATE OF input_hash, context_hash, status ON guru_quarter_analytics
FOR EACH ROW EXECUTE FUNCTION guru_consensus_on_analytics_change();--> statement-breakpoint
CREATE FUNCTION guru_consensus_on_period_filing_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.period_end IS NOT NULL THEN PERFORM guru_consensus_enqueue_period(NEW.period_end); END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER guru_consensus_filing_change
AFTER INSERT OR UPDATE OF period_end, status ON institutional_filings
FOR EACH ROW EXECUTE FUNCTION guru_consensus_on_period_filing_change();--> statement-breakpoint
CREATE TRIGGER guru_consensus_period_state_change
AFTER INSERT OR UPDATE OF status, reason ON institutional_effective_period_states
FOR EACH ROW EXECUTE FUNCTION guru_consensus_on_period_filing_change();--> statement-breakpoint
CREATE FUNCTION guru_consensus_on_guru_cohort_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.active IS DISTINCT FROM OLD.active THEN
    PERFORM guru_consensus_enqueue_all_periods();
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER guru_consensus_guru_cohort_change
AFTER INSERT OR UPDATE OF active ON gurus
FOR EACH ROW EXECUTE FUNCTION guru_consensus_on_guru_cohort_change();--> statement-breakpoint
CREATE FUNCTION guru_consensus_on_security_classification_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.sector IS DISTINCT FROM OLD.sector OR NEW.industry IS DISTINCT FROM OLD.industry
    OR NEW.security_type IS DISTINCT FROM OLD.security_type OR NEW.issuer IS DISTINCT FROM OLD.issuer THEN
    PERFORM guru_consensus_enqueue_all_periods();
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER guru_consensus_security_classification_change
AFTER INSERT OR UPDATE OF sector, industry, security_type, issuer ON institutional_securities
FOR EACH ROW EXECUTE FUNCTION guru_consensus_on_security_classification_change();--> statement-breakpoint
CREATE FUNCTION guru_consensus_on_theme_mapping_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM guru_consensus_enqueue_all_periods();
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER guru_consensus_theme_mapping_change
AFTER INSERT OR UPDATE OR DELETE ON guru_theme_mappings
FOR EACH ROW EXECUTE FUNCTION guru_consensus_on_theme_mapping_change();--> statement-breakpoint
CREATE FUNCTION guru_consensus_on_ticker_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.type = 'TICKER')
    OR (TG_OP = 'INSERT' AND NEW.type = 'TICKER')
    OR (TG_OP = 'UPDATE' AND (NEW.type = 'TICKER' OR OLD.type = 'TICKER')) THEN
    PERFORM guru_consensus_enqueue_all_periods();
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER guru_consensus_ticker_change
AFTER INSERT OR UPDATE OR DELETE ON institutional_security_identifiers
FOR EACH ROW EXECUTE FUNCTION guru_consensus_on_ticker_change();--> statement-breakpoint
SELECT guru_consensus_enqueue_all_periods();
