ALTER TABLE "diaries" ALTER COLUMN "tags" SET DATA TYPE text[] USING CASE
	WHEN "tags" IS NULL OR btrim("tags") = '' THEN ARRAY[]::text[]
	ELSE string_to_array("tags", ',')
END;--> statement-breakpoint
ALTER TABLE "diaries" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "diaries" ALTER COLUMN "tags" SET NOT NULL;
