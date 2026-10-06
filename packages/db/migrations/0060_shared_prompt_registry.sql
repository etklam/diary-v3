CREATE TABLE shared_prompt_version (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 prompt_key varchar(100) NOT NULL,
 revision integer NOT NULL CONSTRAINT shared_prompt_version_revision_positive CHECK (revision > 0),
 name varchar(120) NOT NULL,
 template text NOT NULL CONSTRAINT shared_prompt_version_template_valid CHECK (length(btrim(template)) > 0 AND length(template) <= 12000),
 legacy_prompt_id bigint CONSTRAINT shared_prompt_version_legacy_prompt_id_ai_prompt_version_id_fk REFERENCES ai_prompt_version(id) ON DELETE RESTRICT,
 archived_at timestamptz,
 created_by bigint CONSTRAINT shared_prompt_version_created_by_users_id_fk REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT shared_prompt_version_key_revision UNIQUE(prompt_key, revision),
 CONSTRAINT shared_prompt_version_key_id UNIQUE(prompt_key, id)
);
--> statement-breakpoint
CREATE TABLE shared_prompt_state (
 prompt_key varchar(100) PRIMARY KEY,
 revision integer NOT NULL DEFAULT 0 CONSTRAINT shared_prompt_state_revision_nonnegative CHECK(revision >= 0),
 active_version_id bigint,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT shared_prompt_state_active_version_fk FOREIGN KEY(prompt_key,active_version_id) REFERENCES shared_prompt_version(prompt_key,id)
);
--> statement-breakpoint
INSERT INTO shared_prompt_version(prompt_key,revision,name,template,legacy_prompt_id,created_by,created_at)
SELECT 'ai-report.' || p.report_type::text, 1, 'Migrated active override', p.template, p.id, p.created_by, p.created_at
FROM ai_runtime_state r JOIN ai_prompt_version p ON p.id IN (r.active_weekly_prompt_id,r.active_monthly_prompt_id)
WHERE p.status = 'published' AND NOT p.is_default;
--> statement-breakpoint
INSERT INTO shared_prompt_state(prompt_key,revision,active_version_id)
SELECT prompt_key,revision,id FROM shared_prompt_version;
--> statement-breakpoint
INSERT INTO ai_admin_audit_event(action,target_type,target_id,summary,created_at)
SELECT 'registry.migrate',prompt_key,id::text,'Preserved active legacy prompt lineage',now() FROM shared_prompt_version;
--> statement-breakpoint
CREATE FUNCTION preserve_shared_prompt_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Prompt versions cannot be deleted'; END IF;
 IF ROW(NEW.prompt_key,NEW.revision,NEW.name,NEW.template,NEW.legacy_prompt_id,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.prompt_key,OLD.revision,OLD.name,OLD.template,OLD.legacy_prompt_id,OLD.created_at)
 THEN RAISE EXCEPTION 'Prompt versions are immutable'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER shared_prompt_version_immutable BEFORE UPDATE OR DELETE ON shared_prompt_version FOR EACH ROW EXECUTE FUNCTION preserve_shared_prompt_version();
