ALTER TABLE "research_revision" DROP CONSTRAINT "research_revision_run_hash_key";--> statement-breakpoint
ALTER TABLE "research_revision" DROP CONSTRAINT "research_revision_approval_fields";--> statement-breakpoint
ALTER TABLE "research_article_link" DROP CONSTRAINT "research_article_link_revision_id_research_revision_id_fk";
--> statement-breakpoint
ALTER TABLE "research_revision" DROP CONSTRAINT "research_revision_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "research_run" DROP CONSTRAINT "research_run_requester_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "research_revision" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "research_run" ALTER COLUMN "requester_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "research_provider_config" ADD COLUMN "encrypted_api_key" text;--> statement-breakpoint
ALTER TABLE "research_revision" ADD COLUMN "approved_by_snapshot" bigint;--> statement-breakpoint
ALTER TABLE "research_run" ADD COLUMN "handoff_post_id" bigint;--> statement-breakpoint
ALTER TABLE "research_runtime_state" ADD COLUMN "active_attempt_id" bigint;--> statement-breakpoint
ALTER TABLE "research_runtime_state" ADD COLUMN "active_lease_token" varchar(128);--> statement-breakpoint
ALTER TABLE "research_runtime_state" ADD COLUMN "active_lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "research_revision" ADD CONSTRAINT "research_revision_id_run_key" UNIQUE("id","run_id");--> statement-breakpoint
ALTER TABLE "research_article_link" ADD CONSTRAINT "research_article_link_revision_run_fk" FOREIGN KEY ("revision_id","run_id") REFERENCES "public"."research_revision"("id","run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_article_link" ADD CONSTRAINT "research_article_link_evidence_run_fk" FOREIGN KEY ("run_id","evidence_hash") REFERENCES "public"."research_evidence_snapshot"("run_id","content_hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_revision" ADD CONSTRAINT "research_revision_parent_run_fk" FOREIGN KEY ("run_id","parent_revision") REFERENCES "public"."research_revision"("run_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_revision" ADD CONSTRAINT "research_revision_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_run" ADD CONSTRAINT "research_run_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runtime_state" ADD CONSTRAINT "research_runtime_state_active_attempt_id_research_attempt_id_fk" FOREIGN KEY ("active_attempt_id") REFERENCES "public"."research_attempt"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_provider_config" DROP COLUMN "secret_ref";--> statement-breakpoint
ALTER TABLE "research_revision" ADD CONSTRAINT "research_revision_approval_fields" CHECK ("research_revision"."review_status" <> 'APPROVED' or ("research_revision"."approved_by_snapshot" is not null and "research_revision"."approved_at" is not null));