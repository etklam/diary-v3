CREATE TABLE "disciplines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "disciplines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"content" varchar(255) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disciplines_content_nonempty" CHECK (length(btrim("disciplines"."content")) > 0)
);
--> statement-breakpoint
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disciplines_user_order_id_idx" ON "disciplines" USING btree ("user_id","display_order","id");