ALTER TABLE "diaries" ADD COLUMN "summary_excerpt" text;--> statement-breakpoint
ALTER TABLE "diaries" ADD COLUMN "summary_excerpt_content_hash" varchar(32);--> statement-breakpoint
CREATE FUNCTION invalidate_stale_diary_summary_excerpt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content
    AND (NEW.summary_excerpt_content_hash IS NULL OR NEW.summary_excerpt_content_hash IS DISTINCT FROM md5(NEW.content)) THEN
    NEW.summary_excerpt_content_hash := NULL;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER diaries_summary_excerpt_invalidate
BEFORE UPDATE OF content ON diaries
FOR EACH ROW EXECUTE FUNCTION invalidate_stale_diary_summary_excerpt();
