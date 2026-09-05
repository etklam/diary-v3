CREATE TABLE "partner_links" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "partner_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_a_id" bigint NOT NULL,
	"user_b_id" bigint NOT NULL,
	"initiated_by_user_id" bigint NOT NULL,
	"accepted_at" timestamp with time zone,
	"user_a_shares_diaries" boolean DEFAULT false NOT NULL,
	"user_b_shares_diaries" boolean DEFAULT false NOT NULL,
	"user_a_shares_stock_notes" boolean DEFAULT false NOT NULL,
	"user_b_shares_stock_notes" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_links_user_pair_key" UNIQUE("user_a_id","user_b_id"),
	CONSTRAINT "partner_links_ordered_pair" CHECK ("partner_links"."user_a_id" < "partner_links"."user_b_id"),
	CONSTRAINT "partner_links_initiator_participant" CHECK ("partner_links"."initiated_by_user_id" IN ("partner_links"."user_a_id", "partner_links"."user_b_id")),
	CONSTRAINT "partner_links_pending_private" CHECK ("partner_links"."accepted_at" IS NOT NULL OR NOT ("partner_links"."user_a_shares_diaries" OR "partner_links"."user_b_shares_diaries" OR "partner_links"."user_a_shares_stock_notes" OR "partner_links"."user_b_shares_stock_notes"))
);
--> statement-breakpoint
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_links_user_b_idx" ON "partner_links" USING btree ("user_b_id");--> statement-breakpoint
CREATE INDEX "partner_links_initiated_by_idx" ON "partner_links" USING btree ("initiated_by_user_id");