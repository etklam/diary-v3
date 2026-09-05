CREATE TYPE "public"."trade_plan_status" AS ENUM('draft', 'active', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "trade_plans" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trade_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"diary_id" bigint,
	"symbol" varchar(32) NOT NULL,
	"setup_type" varchar(100),
	"entry_price" numeric(18, 6),
	"entry_zone_low" numeric(18, 6),
	"entry_zone_high" numeric(18, 6),
	"stop_loss" numeric(18, 6),
	"target_price" numeric(18, 6),
	"max_position_size" numeric(18, 2),
	"invalidation_condition" text,
	"notes" text,
	"status" "trade_plan_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_plans_entry_price_nonnegative" CHECK ("trade_plans"."entry_price" is null or "trade_plans"."entry_price" >= 0),
	CONSTRAINT "trade_plans_entry_zone_low_nonnegative" CHECK ("trade_plans"."entry_zone_low" is null or "trade_plans"."entry_zone_low" >= 0),
	CONSTRAINT "trade_plans_entry_zone_high_nonnegative" CHECK ("trade_plans"."entry_zone_high" is null or "trade_plans"."entry_zone_high" >= 0),
	CONSTRAINT "trade_plans_stop_loss_nonnegative" CHECK ("trade_plans"."stop_loss" is null or "trade_plans"."stop_loss" >= 0),
	CONSTRAINT "trade_plans_target_price_nonnegative" CHECK ("trade_plans"."target_price" is null or "trade_plans"."target_price" >= 0),
	CONSTRAINT "trade_plans_max_position_size_nonnegative" CHECK ("trade_plans"."max_position_size" is null or "trade_plans"."max_position_size" >= 0),
	CONSTRAINT "trade_plans_zone_order_v1_check" CHECK ("trade_plans"."entry_zone_low" is null or "trade_plans"."entry_zone_high" is null or "trade_plans"."entry_zone_low" <= "trade_plans"."entry_zone_high")
);
--> statement-breakpoint
ALTER TABLE "trade_plans" ADD CONSTRAINT "trade_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_plans" ADD CONSTRAINT "trade_plans_diary_id_diaries_id_fk" FOREIGN KEY ("diary_id") REFERENCES "public"."diaries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION enforce_trade_plan_diary_owner() RETURNS trigger AS $$
BEGIN
	IF NEW.diary_id IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM diaries WHERE id = NEW.diary_id AND user_id = NEW.user_id
	) THEN
		RAISE EXCEPTION 'Trade Plan and Diary owners must match' USING ERRCODE = '23503';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER trade_plans_diary_owner_trigger
	BEFORE INSERT OR UPDATE OF diary_id, user_id ON trade_plans
	FOR EACH ROW EXECUTE FUNCTION enforce_trade_plan_diary_owner();--> statement-breakpoint
CREATE INDEX "trade_plans_user_status_idx" ON "trade_plans" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "trade_plans_user_symbol_idx" ON "trade_plans" USING btree ("user_id","symbol");--> statement-breakpoint
CREATE INDEX "trade_plans_diary_id_idx" ON "trade_plans" USING btree ("diary_id");
