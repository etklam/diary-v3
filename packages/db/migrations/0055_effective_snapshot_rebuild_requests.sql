CREATE TABLE "institutional_effective_snapshot_rebuild_requests" (
	"manager_id" bigint NOT NULL,
	"period_end" date NOT NULL,
	"requested_revision" bigint DEFAULT 1 NOT NULL,
	"processed_revision" bigint DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_error" varchar(80),
	CONSTRAINT "institutional_effective_snapshot_rebuild_requests_manager_id_period_end_pk" PRIMARY KEY("manager_id","period_end"),
	CONSTRAINT "institutional_effective_snapshot_rebuild_requests_revision_valid" CHECK ("institutional_effective_snapshot_rebuild_requests"."requested_revision" > 0 and "institutional_effective_snapshot_rebuild_requests"."processed_revision" >= 0 and "institutional_effective_snapshot_rebuild_requests"."processed_revision" <= "institutional_effective_snapshot_rebuild_requests"."requested_revision")
);
--> statement-breakpoint
ALTER TABLE "institutional_effective_snapshot_rebuild_requests" ADD CONSTRAINT "institutional_effective_snapshot_rebuild_requests_manager_id_institutional_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."institutional_managers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "institutional_effective_snapshot_rebuild_requests_due_idx" ON "institutional_effective_snapshot_rebuild_requests" USING btree ("next_attempt_at","manager_id","period_end");