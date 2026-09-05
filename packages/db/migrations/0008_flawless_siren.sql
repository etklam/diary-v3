CREATE TYPE "public"."stock_timeline_created_via" AS ENUM('API_KEY', 'WEB', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."stock_timeline_source_type" AS ENUM('TRADE_BASIC_DIARY', 'VIDEO_TRANSCRIBE_SUMMARIZE', 'DIARY', 'ARTICLE', 'MANUAL', 'SYSTEM', 'MARKET_ROTATION', 'SEC_FILING', 'RELATIVE_VALUE', 'SEASONALITY');--> statement-breakpoint
CREATE TABLE "stock_timeline_records" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_timeline_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"stock_id" bigint NOT NULL,
	"summary" text NOT NULL,
	"source_type" "stock_timeline_source_type" NOT NULL,
	"source_title" varchar(255),
	"source_url" varchar(1000),
	"source_diary_id" bigint,
	"source_external_id" varchar(255),
	"source_excerpt" text,
	"confidence" integer,
	"idempotency_key" varchar(128) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_via" "stock_timeline_created_via" DEFAULT 'API_KEY' NOT NULL,
	"created_by_label" varchar(100),
	"metadata_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_timeline_records_user_stock_idempotency_key" UNIQUE("user_id","stock_id","idempotency_key"),
	CONSTRAINT "stock_timeline_records_confidence_check" CHECK ("stock_timeline_records"."confidence" is null or "stock_timeline_records"."confidence" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "stock_timeline_records" ADD CONSTRAINT "stock_timeline_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_timeline_records" ADD CONSTRAINT "stock_timeline_records_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_timeline_records" ADD CONSTRAINT "stock_timeline_records_source_diary_id_diaries_id_fk" FOREIGN KEY ("source_diary_id") REFERENCES "public"."diaries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_timeline_records_user_stock_time_idx" ON "stock_timeline_records" USING btree ("user_id","stock_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_timeline_records_user_time_idx" ON "stock_timeline_records" USING btree ("user_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_timeline_records_source_external_idx" ON "stock_timeline_records" USING btree ("source_type","source_external_id");--> statement-breakpoint
CREATE INDEX "stock_timeline_records_source_diary_idx" ON "stock_timeline_records" USING btree ("source_diary_id");
--> statement-breakpoint
CREATE FUNCTION enforce_evidence_integrity() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'source_diary_id') IS DISTINCT FROM (to_jsonb(OLD) - 'source_diary_id')
      OR (NEW.source_diary_id IS DISTINCT FROM OLD.source_diary_id AND
        (NEW.source_diary_id IS NOT NULL OR EXISTS (SELECT 1 FROM diaries WHERE id = OLD.source_diary_id))) THEN
      RAISE EXCEPTION 'Evidence is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.source_diary_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM diaries WHERE id = NEW.source_diary_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Evidence and Diary owners must match' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER evidence_integrity_trigger BEFORE INSERT OR UPDATE ON stock_timeline_records
  FOR EACH ROW EXECUTE FUNCTION enforce_evidence_integrity();
