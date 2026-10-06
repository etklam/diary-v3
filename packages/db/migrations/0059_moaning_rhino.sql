CREATE TABLE "guru_followers" (
	"guru_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guru_followers_guru_id_user_id_pk" PRIMARY KEY("guru_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "gurus" ADD COLUMN "directory_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guru_followers" ADD CONSTRAINT "guru_followers_guru_id_gurus_id_fk" FOREIGN KEY ("guru_id") REFERENCES "public"."gurus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guru_followers" ADD CONSTRAINT "guru_followers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guru_followers_user_idx" ON "guru_followers" USING btree ("user_id","guru_id");--> statement-breakpoint
CREATE INDEX "gurus_directory_order_idx" ON "gurus" USING btree ("active","directory_order","name");