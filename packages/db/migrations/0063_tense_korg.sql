CREATE TABLE "diary_guru_snapshots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "diary_guru_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"diary_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"security_id" bigint NOT NULL,
	"symbol" varchar(32) NOT NULL,
	"period_end" date NOT NULL,
	"context_version" varchar(40) NOT NULL,
	"consensus_version" varchar(40),
	"consensus_snapshot_id" bigint,
	"holder_count" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "diary_guru_snapshots_diary_security_period_unique" UNIQUE("diary_id","security_id","period_end"),
	CONSTRAINT "diary_guru_snapshots_holder_count_nonnegative" CHECK ("diary_guru_snapshots"."holder_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "guru_notification_consensus_deliveries" (
	"snapshot_id" bigint PRIMARY KEY NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_error" varchar(96),
	"processed_at" timestamp with time zone,
	CONSTRAINT "guru_notification_consensus_deliveries_attempt_valid" CHECK ("guru_notification_consensus_deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "guru_notification_event_deliveries" (
	"event_id" bigint PRIMARY KEY NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_error" varchar(96),
	"processed_at" timestamp with time zone,
	CONSTRAINT "guru_notification_event_deliveries_attempt_valid" CHECK ("guru_notification_event_deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "guru_notification_preferences" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"new_filing" boolean DEFAULT true NOT NULL,
	"new_position" boolean DEFAULT true NOT NULL,
	"exited_position" boolean DEFAULT true NOT NULL,
	"strong_add" boolean DEFAULT true NOT NULL,
	"strong_reduce" boolean DEFAULT true NOT NULL,
	"new_stock_holder" boolean DEFAULT true NOT NULL,
	"consensus_change" boolean DEFAULT false NOT NULL,
	"min_weight_percent" numeric(12, 8),
	"min_quantity_change_percent" numeric(20, 8),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guru_notification_preferences_thresholds_valid" CHECK (("guru_notification_preferences"."min_weight_percent" is null or "guru_notification_preferences"."min_weight_percent" >= 0) and ("guru_notification_preferences"."min_quantity_change_percent" is null or "guru_notification_preferences"."min_quantity_change_percent" >= 0))
);
--> statement-breakpoint
CREATE TABLE "guru_notifications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "guru_notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"event_type" varchar(24) NOT NULL,
	"dedupe_key" varchar(320) NOT NULL,
	"guru_id" bigint,
	"security_id" bigint,
	"period_end" date,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "guru_notifications_user_dedupe_unique" UNIQUE("user_id","dedupe_key"),
	CONSTRAINT "guru_notifications_event_type_valid" CHECK ("guru_notifications"."event_type" in ('NEW_FILING', 'NEW_POSITION', 'EXITED_POSITION', 'STRONG_ADD', 'STRONG_REDUCE', 'NEW_STOCK_HOLDER', 'CONSENSUS_CHANGE'))
);
--> statement-breakpoint
CREATE TABLE "guru_stock_watches" (
	"user_id" bigint NOT NULL,
	"security_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guru_stock_watches_user_id_security_id_pk" PRIMARY KEY("user_id","security_id")
);
--> statement-breakpoint
ALTER TABLE "diary_guru_snapshots" ADD CONSTRAINT "diary_guru_snapshots_diary_id_diaries_id_fk" FOREIGN KEY ("diary_id") REFERENCES "public"."diaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_guru_snapshots" ADD CONSTRAINT "diary_guru_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_guru_snapshots" ADD CONSTRAINT "diary_guru_snapshots_security_id_institutional_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_guru_snapshots" ADD CONSTRAINT "diary_guru_snapshots_consensus_snapshot_id_guru_consensus_snapshots_id_fk" FOREIGN KEY ("consensus_snapshot_id") REFERENCES "public"."guru_consensus_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_notification_consensus_deliveries" ADD CONSTRAINT "guru_notification_consensus_deliveries_snapshot_id_guru_consensus_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."guru_consensus_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_notification_event_deliveries" ADD CONSTRAINT "guru_notification_event_deliveries_event_id_institutional_snapshot_change_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."institutional_snapshot_change_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_notification_preferences" ADD CONSTRAINT "guru_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_notifications" ADD CONSTRAINT "guru_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_notifications" ADD CONSTRAINT "guru_notifications_guru_id_gurus_id_fk" FOREIGN KEY ("guru_id") REFERENCES "public"."gurus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_notifications" ADD CONSTRAINT "guru_notifications_security_id_institutional_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_stock_watches" ADD CONSTRAINT "guru_stock_watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_stock_watches" ADD CONSTRAINT "guru_stock_watches_security_id_institutional_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."institutional_securities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diary_guru_snapshots_owner_idx" ON "diary_guru_snapshots" USING btree ("user_id","diary_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "guru_notification_consensus_deliveries_due_idx" ON "guru_notification_consensus_deliveries" USING btree ("processed_at","next_attempt_at","snapshot_id");--> statement-breakpoint
CREATE INDEX "guru_notification_event_deliveries_due_idx" ON "guru_notification_event_deliveries" USING btree ("processed_at","next_attempt_at","event_id");--> statement-breakpoint
CREATE INDEX "guru_notifications_inbox_idx" ON "guru_notifications" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "guru_notifications_unread_idx" ON "guru_notifications" USING btree ("user_id","id" DESC NULLS LAST) WHERE "guru_notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "guru_stock_watches_security_idx" ON "guru_stock_watches" USING btree ("security_id","user_id");