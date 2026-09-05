CREATE TABLE "etf_prices" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "etf_prices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"etf_id" bigint NOT NULL,
	"date" date NOT NULL,
	"open" numeric(10, 4) NOT NULL,
	"high" numeric(10, 4) NOT NULL,
	"low" numeric(10, 4) NOT NULL,
	"close" numeric(10, 4) NOT NULL,
	"adj_close" numeric(10, 4) NOT NULL,
	"volume" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "etf_prices_etf_date_key" UNIQUE("etf_id","date"),
	CONSTRAINT "etf_prices_volume_nonnegative" CHECK ("etf_prices"."volume" is null or "etf_prices"."volume" >= 0)
);
--> statement-breakpoint
CREATE TABLE "etf_watchlists" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "etf_watchlists_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"etf_id" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "etf_watchlists_user_etf_key" UNIQUE("user_id","etf_id")
);
--> statement-breakpoint
CREATE TABLE "etfs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "etfs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"symbol" varchar(20) NOT NULL,
	"name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "etfs_symbol_key" UNIQUE("symbol"),
	CONSTRAINT "etfs_symbol_canonical" CHECK ("etfs"."symbol" = upper(btrim("etfs"."symbol")) and length("etfs"."symbol") > 0)
);
--> statement-breakpoint
ALTER TABLE "etf_prices" ADD CONSTRAINT "etf_prices_etf_id_etfs_id_fk" FOREIGN KEY ("etf_id") REFERENCES "public"."etfs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etf_watchlists" ADD CONSTRAINT "etf_watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etf_watchlists" ADD CONSTRAINT "etf_watchlists_etf_id_etfs_id_fk" FOREIGN KEY ("etf_id") REFERENCES "public"."etfs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "etf_prices_etf_date_idx" ON "etf_prices" USING btree ("etf_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "etf_watchlists_user_order_idx" ON "etf_watchlists" USING btree ("user_id","sort_order","id");