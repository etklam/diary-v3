CREATE TYPE "public"."investment_thesis_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."thesis_portfolio_decision" AS ENUM('HOLD', 'ADD', 'REDUCE', 'EXIT', 'CONTINUE_WATCHING');--> statement-breakpoint
CREATE TABLE "investment_theses" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "investment_theses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"stock_id" bigint NOT NULL,
	"status" "investment_thesis_status" DEFAULT 'DRAFT' NOT NULL,
	"summary" text,
	"why_i_own_it" text,
	"growth_drivers" text,
	"risks" text,
	"invalidation_conditions" text,
	"expected_holding_period" varchar(255),
	"review_due_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"latest_review_outcome" "thesis_review_outcome",
	"activated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investment_theses_user_stock_key" UNIQUE("user_id","stock_id"),
	CONSTRAINT "investment_theses_id_user_id_key" UNIQUE("id","user_id"),
	CONSTRAINT "investment_theses_active_content_check" CHECK ("investment_theses"."status" <> 'ACTIVE' OR (nullif(btrim("investment_theses"."summary"), '') is not null AND nullif(btrim("investment_theses"."why_i_own_it"), '') is not null))
);
--> statement-breakpoint
CREATE TABLE "thesis_reviews" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "thesis_reviews_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"thesis_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "thesis_review_outcome" NOT NULL,
	"what_improved" text,
	"what_deteriorated" text,
	"what_changed" text,
	"invalidation_triggered" boolean DEFAULT false NOT NULL,
	"portfolio_decision" "thesis_portfolio_decision" NOT NULL,
	"snapshot_status" "investment_thesis_status" NOT NULL,
	"snapshot_summary" text,
	"snapshot_why_i_own_it" text,
	"snapshot_growth_drivers" text,
	"snapshot_risks" text,
	"snapshot_invalidation_conditions" text,
	"snapshot_expected_holding_period" varchar(255),
	"snapshot_review_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thesis_reviews_reflection_check" CHECK (nullif(btrim("thesis_reviews"."what_improved"), '') is not null OR nullif(btrim("thesis_reviews"."what_deteriorated"), '') is not null OR nullif(btrim("thesis_reviews"."what_changed"), '') is not null)
);
--> statement-breakpoint
ALTER TABLE "investment_theses" ADD CONSTRAINT "investment_theses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_theses" ADD CONSTRAINT "investment_theses_stock_id_stocks_id_fk" FOREIGN KEY ("stock_id") REFERENCES "public"."stocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thesis_reviews" ADD CONSTRAINT "thesis_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thesis_reviews" ADD CONSTRAINT "thesis_reviews_thesis_owner_fkey" FOREIGN KEY ("thesis_id","user_id") REFERENCES "public"."investment_theses"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investment_theses_user_status_due_idx" ON "investment_theses" USING btree ("user_id","status","review_due_at");--> statement-breakpoint
CREATE INDEX "thesis_reviews_user_thesis_time_idx" ON "thesis_reviews" USING btree ("user_id","thesis_id","reviewed_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "thesis_reviews_thesis_user_idx" ON "thesis_reviews" USING btree ("thesis_id","user_id");