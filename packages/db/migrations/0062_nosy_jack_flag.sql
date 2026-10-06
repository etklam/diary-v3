CREATE TABLE "guru_analysis_event_deliveries" (
	"event_id" bigint PRIMARY KEY NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_error" varchar(96),
	"processed_at" timestamp with time zone,
	CONSTRAINT "guru_analysis_event_deliveries_attempt_valid" CHECK ("guru_analysis_event_deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "guru_analysis_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "guru_analysis_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"manager_id" bigint NOT NULL,
	"period_end" date NOT NULL,
	"analytics_id" bigint NOT NULL,
	"analytics_version" varchar(40) NOT NULL,
	"analytics_context_hash" varchar(64) NOT NULL,
	"consensus_snapshot_id" bigint,
	"consensus_version" varchar(40),
	"context_version" varchar(40) NOT NULL,
	"schema_version" varchar(40) NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"context" jsonb NOT NULL,
	"prompt_key" varchar(100) NOT NULL,
	"prompt_source" varchar(16) NOT NULL,
	"prompt_system_version" varchar(40) NOT NULL,
	"prompt_override_version_id" bigint,
	"prompt_template_hash" varchar(64) NOT NULL,
	"provider_config_version_id" bigint,
	"model" varchar(200),
	"attempt_id" bigint,
	"status" varchar(16) NOT NULL,
	"source_state" varchar(16) DEFAULT 'current' NOT NULL,
	"reason" varchar(16) NOT NULL,
	"result" jsonb,
	"error_code" varchar(80),
	"worker_id" varchar(128),
	"lease_token" varchar(128),
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"reservation_bucket_month" date NOT NULL,
	"reservation_cost_cents" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost_cents" integer,
	"latency_ms" integer,
	"provider_request_id" varchar(200),
	"requested_by_user_id" bigint,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" varchar(80),
	"queued_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "guru_analysis_runs_hash_valid" CHECK ("guru_analysis_runs"."input_hash" ~ '^[a-f0-9]{64}$' and "guru_analysis_runs"."analytics_context_hash" ~ '^[a-f0-9]{64}$' and "guru_analysis_runs"."prompt_template_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "guru_analysis_runs_status_valid" CHECK ("guru_analysis_runs"."status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "guru_analysis_runs_source_state_valid" CHECK ("guru_analysis_runs"."source_state" in ('current', 'invalidated')),
	CONSTRAINT "guru_analysis_runs_reason_valid" CHECK ("guru_analysis_runs"."reason" in ('INITIAL', 'REGENERATION')),
	CONSTRAINT "guru_analysis_runs_prompt_source_valid" CHECK (("guru_analysis_runs"."prompt_source" = 'system-default' and "guru_analysis_runs"."prompt_override_version_id" is null) or ("guru_analysis_runs"."prompt_source" = 'override' and "guru_analysis_runs"."prompt_override_version_id" is not null)),
	CONSTRAINT "guru_analysis_runs_result_state_valid" CHECK (("guru_analysis_runs"."status" = 'succeeded' and "guru_analysis_runs"."result" is not null) or ("guru_analysis_runs"."status" <> 'succeeded' and "guru_analysis_runs"."result" is null)),
	CONSTRAINT "guru_analysis_runs_terminal_valid" CHECK (("guru_analysis_runs"."status" in ('succeeded', 'failed', 'cancelled')) = ("guru_analysis_runs"."finished_at" is not null)),
	CONSTRAINT "guru_analysis_runs_lease_valid" CHECK (("guru_analysis_runs"."status" = 'running' and "guru_analysis_runs"."lease_token" is not null and "guru_analysis_runs"."lease_expires_at" is not null) or ("guru_analysis_runs"."status" <> 'running' and "guru_analysis_runs"."lease_token" is null and "guru_analysis_runs"."lease_expires_at" is null)),
	CONSTRAINT "guru_analysis_runs_invalidation_valid" CHECK (("guru_analysis_runs"."source_state" = 'current' and "guru_analysis_runs"."invalidated_at" is null and "guru_analysis_runs"."invalidation_reason" is null) or ("guru_analysis_runs"."source_state" = 'invalidated' and "guru_analysis_runs"."invalidated_at" is not null and "guru_analysis_runs"."invalidation_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "guru_analysis_event_deliveries" ADD CONSTRAINT "guru_analysis_event_deliveries_event_id_institutional_snapshot_change_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."institutional_snapshot_change_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_analysis_runs" ADD CONSTRAINT "guru_analysis_runs_manager_id_institutional_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."institutional_managers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_analysis_runs" ADD CONSTRAINT "guru_analysis_runs_analytics_id_guru_quarter_analytics_id_fk" FOREIGN KEY ("analytics_id") REFERENCES "public"."guru_quarter_analytics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_analysis_runs" ADD CONSTRAINT "guru_analysis_runs_consensus_snapshot_id_guru_consensus_snapshots_id_fk" FOREIGN KEY ("consensus_snapshot_id") REFERENCES "public"."guru_consensus_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_analysis_runs" ADD CONSTRAINT "guru_analysis_runs_prompt_override_version_id_shared_prompt_version_id_fk" FOREIGN KEY ("prompt_override_version_id") REFERENCES "public"."shared_prompt_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_analysis_runs" ADD CONSTRAINT "guru_analysis_runs_provider_config_version_id_ai_provider_config_version_id_fk" FOREIGN KEY ("provider_config_version_id") REFERENCES "public"."ai_provider_config_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_analysis_runs" ADD CONSTRAINT "guru_analysis_runs_attempt_id_ai_report_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."ai_report_attempt"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_analysis_runs" ADD CONSTRAINT "guru_analysis_runs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guru_analysis_event_deliveries_due_idx" ON "guru_analysis_event_deliveries" USING btree ("processed_at","next_attempt_at","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guru_analysis_runs_active_unique" ON "guru_analysis_runs" USING btree ("manager_id","period_end") WHERE "guru_analysis_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "guru_analysis_runs_latest_idx" ON "guru_analysis_runs" USING btree ("manager_id","period_end" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "guru_analysis_runs_reuse_idx" ON "guru_analysis_runs" USING btree ("manager_id","period_end","input_hash","prompt_key");--> statement-breakpoint
CREATE INDEX "guru_analysis_runs_queue_idx" ON "guru_analysis_runs" USING btree ("status","queued_at","id");