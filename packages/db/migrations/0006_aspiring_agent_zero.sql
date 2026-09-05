CREATE TABLE "diary_stocks" (
	"diary_id" bigint NOT NULL,
	"stock_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diary_stocks_diary_id_stock_id_pk" PRIMARY KEY("diary_id","stock_id")
);
--> statement-breakpoint
CREATE TABLE "stocks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stocks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"symbol" varchar(32) NOT NULL,
	"quote_symbol" varchar(32),
	"name" varchar(255),
	"exchange" varchar(32),
	"currency" varchar(8),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stocks_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
ALTER TABLE "diary_stocks" ADD CONSTRAINT "diary_stocks_diary_id_diaries_id_fk" FOREIGN KEY ("diary_id") REFERENCES "public"."diaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_stocks" ADD CONSTRAINT "diary_stocks_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diary_stocks_stock_diary_idx" ON "diary_stocks" USING btree ("stock_id","diary_id");