CREATE TABLE "personal_achievements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "personal_achievements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"date" date NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_achievements_content_nonempty" CHECK (length(btrim("personal_achievements"."content")) > 0),
	CONSTRAINT "personal_achievements_content_length" CHECK (length("personal_achievements"."content") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "personal_achievements" ADD CONSTRAINT "personal_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personal_achievements_user_date_idx" ON "personal_achievements" USING btree ("user_id","date" DESC NULLS LAST,"id" DESC NULLS LAST);