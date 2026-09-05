CREATE TYPE "public"."transaction_type" AS ENUM('BUY', 'SELL');--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"diary_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"quantity" numeric(15, 4) NOT NULL,
	"price" numeric(15, 4) NOT NULL,
	"trade_date" timestamp with time zone NOT NULL,
	"notes" text,
	"strategy" varchar(100),
	"emotion" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_quantity_positive" CHECK ("transactions"."quantity" > 0),
	CONSTRAINT "transactions_price_positive" CHECK ("transactions"."price" > 0)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_diary_owner_fkey" FOREIGN KEY ("diary_id","user_id") REFERENCES "public"."diaries"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_diary_id_idx" ON "transactions" USING btree ("diary_id");--> statement-breakpoint
CREATE INDEX "transactions_diary_owner_idx" ON "transactions" USING btree ("diary_id","user_id");--> statement-breakpoint
CREATE INDEX "transactions_symbol_trade_date_idx" ON "transactions" USING btree ("symbol","trade_date");--> statement-breakpoint
CREATE INDEX "transactions_user_trade_date_idx" ON "transactions" USING btree ("user_id","trade_date");