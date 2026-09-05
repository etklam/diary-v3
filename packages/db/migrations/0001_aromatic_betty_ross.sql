ALTER TABLE "users" ADD COLUMN "locale" varchar(5) DEFAULT 'zh-TW' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "exclude_holidays_in_stats" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_locale_valid" CHECK ("users"."locale" in ('zh-TW', 'zh-CN', 'en'));
