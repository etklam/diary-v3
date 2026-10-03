CREATE TYPE "public"."personal_goal_status" AS ENUM('active', 'achieved');--> statement-breakpoint
CREATE TABLE "personal_goals" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "personal_goals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"content" text NOT NULL,
	"target_date" date,
	"status" "personal_goal_status" DEFAULT 'active' NOT NULL,
	"achieved_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_goals_content_nonempty" CHECK (length(btrim("personal_goals"."content")) > 0),
	CONSTRAINT "personal_goals_content_length" CHECK (length("personal_goals"."content") <= 1000),
	CONSTRAINT "personal_goals_achieved_date_consistency" CHECK (("personal_goals"."status" = 'achieved') = ("personal_goals"."achieved_date" is not null))
);
--> statement-breakpoint
ALTER TABLE "personal_goals" ADD CONSTRAINT "personal_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_goals_user_status_idx" ON "personal_goals" USING btree ("user_id","status","target_date","id" DESC NULLS LAST);