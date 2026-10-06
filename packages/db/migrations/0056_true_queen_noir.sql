CREATE TABLE "guru_analytics_event_deliveries" (
	"event_id" bigint PRIMARY KEY NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_error" varchar(96),
	"processed_at" timestamp with time zone,
	CONSTRAINT "guru_analytics_event_deliveries_attempt_valid" CHECK ("guru_analytics_event_deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "guru_holding_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "guru_holding_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"analytics_id" bigint NOT NULL,
	"position_key" varchar(256) NOT NULL,
	"security_id" bigint,
	"ticker" varchar(32),
	"company" text NOT NULL,
	"action" varchar(20) NOT NULL,
	"quantity_type" varchar(8) NOT NULL,
	"put_call" varchar(8),
	"previous_quantity" numeric(32, 8),
	"comparable_previous_quantity" numeric(32, 8),
	"current_quantity" numeric(32, 8),
	"quantity_change" numeric(32, 8) NOT NULL,
	"quantity_change_percent" numeric(20, 8),
	"quantity_adjustment_factor" numeric(24, 12),
	"corporate_action_event_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"previous_weight_percent" numeric(12, 8),
	"current_weight_percent" numeric(12, 8),
	"weight_change_percentage_points" numeric(12, 8),
	"previous_rank" integer,
	"current_rank" integer,
	"rank_change" integer,
	"previous_reported_value_usd" numeric(32, 8),
	"current_reported_value_usd" numeric(32, 8),
	"reported_value_change_usd" numeric(32, 8),
	CONSTRAINT "guru_holding_changes_analytics_position_unique" UNIQUE("analytics_id","position_key"),
	CONSTRAINT "guru_holding_changes_action_valid" CHECK ("guru_holding_changes"."action" in ('NEW', 'STRONG_ADD', 'ADD', 'UNCHANGED', 'REDUCE', 'STRONG_REDUCE', 'EXIT')),
	CONSTRAINT "guru_holding_changes_exposure_valid" CHECK ("guru_holding_changes"."quantity_type" in ('SH', 'PRN') and ("guru_holding_changes"."put_call" is null or "guru_holding_changes"."put_call" in ('PUT', 'CALL')))
);
--> statement-breakpoint
CREATE TABLE "guru_quarter_analytics" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "guru_quarter_analytics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"manager_id" bigint NOT NULL,
	"period_end" date NOT NULL,
	"snapshot_id" bigint NOT NULL,
	"previous_snapshot_id" bigint,
	"analytics_version" varchar(40) NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"status" varchar(16) NOT NULL,
	"comparison_status" varchar(40) NOT NULL,
	"reported_value_usd" numeric(32, 8) NOT NULL,
	"holding_count" integer NOT NULL,
	"source_row_count" integer NOT NULL,
	"mapped_row_count" integer NOT NULL,
	"mapping_coverage_percent" numeric(12, 8) NOT NULL,
	"top_one_concentration_percent" numeric(12, 8) NOT NULL,
	"top_five_concentration_percent" numeric(12, 8) NOT NULL,
	"top_ten_concentration_percent" numeric(12, 8) NOT NULL,
	"hhi" numeric(16, 4) NOT NULL,
	"disclosed_weight_turnover_percent" numeric(12, 8),
	"turnover_band" varchar(10),
	"turnover_unavailable_reason" varchar(48),
	"new_count" integer NOT NULL,
	"strong_add_count" integer NOT NULL,
	"add_count" integer NOT NULL,
	"unchanged_count" integer NOT NULL,
	"reduce_count" integer NOT NULL,
	"strong_reduce_count" integer NOT NULL,
	"exit_count" integer NOT NULL,
	"result" jsonb,
	"calculated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "guru_quarter_analytics_manager_period_version_unique" UNIQUE("manager_id","period_end","analytics_version"),
	CONSTRAINT "guru_quarter_analytics_hash_valid" CHECK ("guru_quarter_analytics"."input_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "guru_quarter_analytics_status_valid" CHECK ("guru_quarter_analytics"."status" in ('READY', 'PARTIAL', 'ERROR')),
	CONSTRAINT "guru_quarter_analytics_result_state_valid" CHECK (("guru_quarter_analytics"."status" = 'READY' and "guru_quarter_analytics"."result" is not null) or ("guru_quarter_analytics"."status" <> 'READY' and "guru_quarter_analytics"."result" is null)),
	CONSTRAINT "guru_quarter_analytics_counts_valid" CHECK ("guru_quarter_analytics"."holding_count" >= 0 and "guru_quarter_analytics"."source_row_count" >= 0 and "guru_quarter_analytics"."mapped_row_count" >= 0 and "guru_quarter_analytics"."mapped_row_count" <= "guru_quarter_analytics"."source_row_count" and "guru_quarter_analytics"."new_count" >= 0 and "guru_quarter_analytics"."strong_add_count" >= 0 and "guru_quarter_analytics"."add_count" >= 0 and "guru_quarter_analytics"."unchanged_count" >= 0 and "guru_quarter_analytics"."reduce_count" >= 0 and "guru_quarter_analytics"."strong_reduce_count" >= 0 and "guru_quarter_analytics"."exit_count" >= 0),
	CONSTRAINT "guru_quarter_analytics_turnover_valid" CHECK (("guru_quarter_analytics"."turnover_band" is null or "guru_quarter_analytics"."turnover_band" in ('LOW', 'MODERATE', 'HIGH')) and (("guru_quarter_analytics"."disclosed_weight_turnover_percent" is null and "guru_quarter_analytics"."turnover_band" is null) or ("guru_quarter_analytics"."disclosed_weight_turnover_percent" is not null and "guru_quarter_analytics"."turnover_unavailable_reason" is null)))
);
--> statement-breakpoint
ALTER TABLE "guru_analytics_event_deliveries" ADD CONSTRAINT "guru_analytics_event_deliveries_event_id_institutional_snapshot_change_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."institutional_snapshot_change_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_holding_changes" ADD CONSTRAINT "guru_holding_changes_analytics_id_guru_quarter_analytics_id_fk" FOREIGN KEY ("analytics_id") REFERENCES "public"."guru_quarter_analytics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_holding_changes" ADD CONSTRAINT "guru_holding_changes_security_id_institutional_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_quarter_analytics" ADD CONSTRAINT "guru_quarter_analytics_manager_id_institutional_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."institutional_managers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_quarter_analytics" ADD CONSTRAINT "guru_quarter_analytics_snapshot_id_institutional_effective_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."institutional_effective_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_quarter_analytics" ADD CONSTRAINT "guru_quarter_analytics_previous_snapshot_id_institutional_effective_snapshots_id_fk" FOREIGN KEY ("previous_snapshot_id") REFERENCES "public"."institutional_effective_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guru_analytics_event_deliveries_due_idx" ON "guru_analytics_event_deliveries" USING btree ("processed_at","next_attempt_at","event_id");--> statement-breakpoint
CREATE INDEX "guru_holding_changes_stock_idx" ON "guru_holding_changes" USING btree ("security_id","action","analytics_id");--> statement-breakpoint
CREATE INDEX "guru_quarter_analytics_period_idx" ON "guru_quarter_analytics" USING btree ("period_end","manager_id");