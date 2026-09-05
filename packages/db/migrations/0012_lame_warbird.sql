CREATE TYPE "public"."price_alert_type" AS ENUM('PRICE_ABOVE', 'PRICE_BELOW', 'CHANGE_PERCENT', 'MOVING_AVG');--> statement-breakpoint
CREATE TABLE "price_alerts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "price_alerts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"symbol" varchar(32) NOT NULL,
	"type" "price_alert_type" NOT NULL,
	"threshold" numeric(10, 4) NOT NULL,
	"message" varchar(500) NOT NULL,
	"is_triggered" boolean DEFAULT false NOT NULL,
	"triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_alerts_trigger_state_check" CHECK ("price_alerts"."is_triggered" = ("price_alerts"."triggered_at" is not null)),
	CONSTRAINT "price_alerts_threshold_check" CHECK ("price_alerts"."type" = 'CHANGE_PERCENT' or "price_alerts"."threshold" >= 0),
	CONSTRAINT "price_alerts_symbol_check" CHECK ("price_alerts"."symbol" ~ '^[A-Z0-9.]+$')
);
--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_alerts_user_created_idx" ON "price_alerts" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "price_alerts_pending_idx" ON "price_alerts" USING btree ("is_triggered","symbol");