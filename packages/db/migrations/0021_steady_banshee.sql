ALTER TABLE "users" ADD COLUMN "default_workspace_page" varchar(16) DEFAULT 'timeline' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_default_workspace_page_valid" CHECK ("users"."default_workspace_page" in ('diaries', 'timeline', 'calendar'));
