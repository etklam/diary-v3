CREATE TABLE "trade_plan_execution_baselines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trade_plan_execution_baselines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"trade_plan_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"plan_updated_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"symbol" varchar(32) NOT NULL,
	"setup_type" varchar(100),
	"entry_price" numeric(18, 6),
	"entry_zone_low" numeric(18, 6),
	"entry_zone_high" numeric(18, 6),
	"stop_loss" numeric(18, 6),
	"target_price" numeric(18, 6),
	"max_position_size" numeric(18, 2),
	"max_position_size_unit" varchar(16) DEFAULT 'unknown' NOT NULL,
	"invalidation_condition" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_plan_execution_baseline_plan_version_key" UNIQUE("trade_plan_id","version"),
	CONSTRAINT "trade_plan_execution_baseline_version_positive" CHECK ("trade_plan_execution_baselines"."version" > 0),
	CONSTRAINT "trade_plan_execution_baseline_unit_unknown" CHECK ("trade_plan_execution_baselines"."max_position_size_unit" = 'unknown')
);
--> statement-breakpoint
CREATE TABLE "trade_plan_execution_transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trade_plan_execution_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"execution_id" bigint NOT NULL,
	"transaction_id" bigint,
	"snapshot_transaction_id" bigint NOT NULL,
	"snapshot_diary_id" bigint NOT NULL,
	"snapshot_symbol" varchar(20) NOT NULL,
	"snapshot_type" "transaction_type" NOT NULL,
	"snapshot_quantity" numeric(15, 4) NOT NULL,
	"snapshot_price" numeric(15, 4) NOT NULL,
	"snapshot_trade_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_plan_execution_transaction_key" UNIQUE("execution_id","snapshot_symbol","snapshot_trade_date","id")
);
--> statement-breakpoint
CREATE TABLE "trade_plan_executions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trade_plan_executions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"trade_plan_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"baseline_id" bigint NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"deviation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_plan_execution_plan_key" UNIQUE("trade_plan_id")
	,CONSTRAINT "trade_plan_execution_revision_positive" CHECK ("trade_plan_executions"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "trade_plan_execution_baselines" ADD CONSTRAINT "trade_plan_execution_baselines_trade_plan_id_trade_plans_id_fk" FOREIGN KEY ("trade_plan_id") REFERENCES "public"."trade_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_plan_execution_baselines" ADD CONSTRAINT "trade_plan_execution_baselines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_plan_execution_transactions" ADD CONSTRAINT "trade_plan_execution_transactions_execution_id_trade_plan_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."trade_plan_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_plan_execution_transactions" ADD CONSTRAINT "trade_plan_execution_transactions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_plan_executions" ADD CONSTRAINT "trade_plan_executions_trade_plan_id_trade_plans_id_fk" FOREIGN KEY ("trade_plan_id") REFERENCES "public"."trade_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_plan_executions" ADD CONSTRAINT "trade_plan_executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_plan_executions" ADD CONSTRAINT "trade_plan_executions_baseline_id_trade_plan_execution_baselines_id_fk" FOREIGN KEY ("baseline_id") REFERENCES "public"."trade_plan_execution_baselines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_plan_execution_baseline_owner_plan_idx" ON "trade_plan_execution_baselines" USING btree ("user_id","trade_plan_id","version" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "trade_plan_execution_transaction_once_key" ON "trade_plan_execution_transactions" USING btree ("transaction_id") WHERE "trade_plan_execution_transactions"."transaction_id" is not null;--> statement-breakpoint
CREATE INDEX "trade_plan_execution_transaction_execution_idx" ON "trade_plan_execution_transactions" USING btree ("execution_id","id");--> statement-breakpoint
CREATE INDEX "trade_plan_execution_owner_idx" ON "trade_plan_executions" USING btree ("user_id","trade_plan_id");--> statement-breakpoint
CREATE FUNCTION enforce_trade_plan_execution_baseline_owner() RETURNS trigger AS $$
DECLARE plan_user bigint; plan_symbol varchar;
BEGIN
  SELECT user_id, symbol INTO plan_user, plan_symbol FROM trade_plans WHERE id = NEW.trade_plan_id;
  IF plan_user IS NULL OR plan_user <> NEW.user_id OR plan_symbol <> NEW.symbol THEN
    RAISE EXCEPTION 'Trade plan execution baseline owner or symbol mismatch' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER trade_plan_execution_baseline_owner_trigger
  BEFORE INSERT OR UPDATE OF trade_plan_id, user_id, symbol ON trade_plan_execution_baselines
  FOR EACH ROW EXECUTE FUNCTION enforce_trade_plan_execution_baseline_owner();--> statement-breakpoint
CREATE FUNCTION enforce_trade_plan_execution_owner() RETURNS trigger AS $$
DECLARE plan_user bigint; baseline_plan bigint; baseline_user bigint;
BEGIN
  SELECT user_id INTO plan_user FROM trade_plans WHERE id = NEW.trade_plan_id;
  SELECT trade_plan_id, user_id INTO baseline_plan, baseline_user FROM trade_plan_execution_baselines WHERE id = NEW.baseline_id;
  IF plan_user IS NULL OR plan_user <> NEW.user_id OR baseline_plan IS NULL OR baseline_plan <> NEW.trade_plan_id OR baseline_user <> NEW.user_id THEN
    RAISE EXCEPTION 'Trade plan execution owner or baseline mismatch' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER trade_plan_execution_owner_trigger
  BEFORE INSERT OR UPDATE OF trade_plan_id, user_id, baseline_id ON trade_plan_executions
  FOR EACH ROW EXECUTE FUNCTION enforce_trade_plan_execution_owner();--> statement-breakpoint
CREATE FUNCTION enforce_trade_plan_execution_transaction_owner() RETURNS trigger AS $$
DECLARE execution_plan bigint; execution_user bigint; plan_symbol varchar; transaction_user bigint; transaction_symbol varchar; transaction_diary bigint;
BEGIN
  SELECT trade_plan_id, user_id INTO execution_plan, execution_user FROM trade_plan_executions WHERE id = NEW.execution_id;
  SELECT user_id, symbol, diary_id INTO transaction_user, transaction_symbol, transaction_diary FROM transactions WHERE id = NEW.transaction_id;
  SELECT symbol INTO plan_symbol FROM trade_plans WHERE id = execution_plan;
  IF TG_OP = 'INSERT' AND NEW.transaction_id IS NULL THEN
    RAISE EXCEPTION 'Trade plan execution transaction must originate from a transaction row' USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.snapshot_transaction_id IS DISTINCT FROM OLD.snapshot_transaction_id
    OR NEW.snapshot_diary_id IS DISTINCT FROM OLD.snapshot_diary_id
    OR NEW.snapshot_symbol IS DISTINCT FROM OLD.snapshot_symbol
    OR NEW.snapshot_type IS DISTINCT FROM OLD.snapshot_type
    OR NEW.snapshot_quantity IS DISTINCT FROM OLD.snapshot_quantity
    OR NEW.snapshot_price IS DISTINCT FROM OLD.snapshot_price
    OR NEW.snapshot_trade_date IS DISTINCT FROM OLD.snapshot_trade_date
  ) THEN
    RAISE EXCEPTION 'Trade plan execution transaction snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  IF execution_plan IS NULL OR plan_symbol IS NULL OR NEW.snapshot_symbol <> plan_symbol OR (NEW.transaction_id IS NOT NULL AND (
    transaction_user <> execution_user
    OR transaction_symbol <> NEW.snapshot_symbol
    OR NEW.snapshot_transaction_id <> NEW.transaction_id
    OR NEW.snapshot_diary_id <> transaction_diary
  )) THEN
    RAISE EXCEPTION 'Trade plan execution transaction owner or symbol mismatch' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER trade_plan_execution_transaction_owner_trigger
  BEFORE INSERT OR UPDATE OF execution_id, transaction_id, snapshot_transaction_id, snapshot_diary_id, snapshot_symbol, snapshot_type, snapshot_quantity, snapshot_price, snapshot_trade_date ON trade_plan_execution_transactions
  FOR EACH ROW EXECUTE FUNCTION enforce_trade_plan_execution_transaction_owner();
