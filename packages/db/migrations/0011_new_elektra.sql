CREATE TYPE "public"."alert_recurring_mode" AS ENUM('WEEK', 'MONTH');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alerts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"diary_id" bigint NOT NULL,
	"message" varchar(500) NOT NULL,
	"trigger_at" timestamp with time zone NOT NULL,
	"is_dismissed" boolean DEFAULT false NOT NULL,
	"recurring_mode" "alert_recurring_mode",
	"parent_id" bigint,
	"instance_number" integer DEFAULT 1 NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_id_diary_unique" UNIQUE("id","diary_id"),
	CONSTRAINT "alerts_parent_instance_unique" UNIQUE("parent_id","instance_number"),
	CONSTRAINT "alerts_instance_positive" CHECK ("alerts"."instance_number" > 0),
	CONSTRAINT "alerts_message_nonempty" CHECK (length(trim("alerts"."message")) > 0),
	CONSTRAINT "alerts_single_shape" CHECK ("alerts"."recurring_mode" is not null or ("alerts"."parent_id" is null and "alerts"."instance_number" = 1))
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_diary_id_diaries_id_fk" FOREIGN KEY ("diary_id") REFERENCES "public"."diaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_parent_same_diary_fk" FOREIGN KEY ("parent_id","diary_id") REFERENCES "public"."alerts"("id","diary_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_diary_trigger_id_idx" ON "alerts" USING btree ("diary_id","trigger_at","id");--> statement-breakpoint
CREATE INDEX "alerts_pending_trigger_idx" ON "alerts" USING btree ("is_dismissed","trigger_at","id");