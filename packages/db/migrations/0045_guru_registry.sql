CREATE TABLE "gurus" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "gurus_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"manager_id" bigint NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(200) NOT NULL,
	"manager_name" varchar(200) NOT NULL,
	"description" text,
	"investment_philosophy" text,
	"style_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"manager_type" varchar(80),
	"website" varchar(2048),
	"country" varchar(2),
	"image_url" varchar(2048),
	"security_notes" text,
	"featured" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gurus_slug_unique" UNIQUE("slug"),
	CONSTRAINT "gurus_manager_unique" UNIQUE("manager_id"),
	CONSTRAINT "gurus_slug_valid" CHECK ("gurus"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and "gurus"."slug" not in ('consensus', 'activity', 'stocks', 'sectors', 'compare')),
	CONSTRAINT "gurus_name_nonempty" CHECK (length(btrim("gurus"."name")) > 0),
	CONSTRAINT "gurus_manager_name_nonempty" CHECK (length(btrim("gurus"."manager_name")) > 0),
	CONSTRAINT "gurus_country_valid" CHECK ("gurus"."country" is null or "gurus"."country" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "institutional_managers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "institutional_managers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cik" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutional_managers_cik_unique" UNIQUE("cik"),
	CONSTRAINT "institutional_managers_cik_canonical" CHECK ("institutional_managers"."cik" ~ '^[0-9]{10}$' and "institutional_managers"."cik" <> '0000000000')
);
--> statement-breakpoint
ALTER TABLE "gurus" ADD CONSTRAINT "gurus_manager_id_institutional_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."institutional_managers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gurus_created_idx" ON "gurus" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "gurus_visibility_idx" ON "gurus" USING btree ("active","featured","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);