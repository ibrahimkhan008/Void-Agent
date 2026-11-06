-- Add canonical project-scoped entity identities without replacing the
-- reviewable fact graph. Existing claims remain the evidence/review source.
CREATE TABLE IF NOT EXISTS "project_brain_page" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "entity_type" varchar(32) NOT NULL,
  "title" varchar(160) NOT NULL,
  "normalized_title" varchar(160) NOT NULL,
  "merged_into_page_id" uuid,
  "archived_at" timestamp,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "project_brain_page_project_type_title_unique"
    UNIQUE ("project_id", "entity_type", "normalized_title")
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "project_brain_page"
    ADD CONSTRAINT "project_brain_page_merged_into_fk"
    FOREIGN KEY ("merged_into_page_id")
    REFERENCES "project_brain_page"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_brain_page_project_idx"
  ON "project_brain_page" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_page_project_title_idx"
  ON "project_brain_page" ("project_id", "normalized_title");
--> statement-breakpoint

ALTER TABLE "project_brain_fact"
  ADD COLUMN IF NOT EXISTS "subject_page_id" uuid;
--> statement-breakpoint
ALTER TABLE "project_brain_fact"
  ADD COLUMN IF NOT EXISTS "object_page_id" uuid;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "project_brain_fact"
    ADD CONSTRAINT "project_brain_fact_subject_page_fk"
    FOREIGN KEY ("subject_page_id")
    REFERENCES "project_brain_page"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_brain_fact"
    ADD CONSTRAINT "project_brain_fact_object_page_fk"
    FOREIGN KEY ("object_page_id")
    REFERENCES "project_brain_page"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Backfill only explicit typed-entity claims. The first observed title is kept
-- as the stable display title; aliases remain separately reviewable claims.
INSERT INTO "project_brain_page" (
  "project_id", "entity_type", "title", "normalized_title", "created_at", "updated_at"
)
SELECT DISTINCT ON (
  f."project_id",
  lower(btrim(f."object")),
  lower(btrim(regexp_replace(f."subject", '[[:space:]]+', ' ', 'g')))
)
  f."project_id",
  lower(btrim(f."object")),
  btrim(regexp_replace(f."subject", '[[:space:]]+', ' ', 'g')),
  lower(btrim(regexp_replace(f."subject", '[[:space:]]+', ' ', 'g'))),
  f."created_at",
  CURRENT_TIMESTAMP
FROM "project_brain_fact" AS f
WHERE lower(btrim(f."predicate")) = 'entity type'
  AND lower(btrim(f."object")) IN (
    'person', 'organization', 'project', 'course', 'task', 'meeting',
    'document', 'decision', 'topic', 'concept', 'tool', 'agent', 'other'
  )
  AND btrim(f."subject") <> ''
ON CONFLICT ("project_id", "entity_type", "normalized_title") DO NOTHING;
--> statement-breakpoint

-- Link explicit entity-type claims even when two types share the same title.
UPDATE "project_brain_fact" AS f
SET "subject_page_id" = p."id"
FROM "project_brain_page" AS p
WHERE lower(btrim(f."predicate")) = 'entity type'
  AND f."project_id" = p."project_id"
  AND lower(btrim(f."object")) = p."entity_type"
  AND lower(btrim(regexp_replace(f."subject", '[[:space:]]+', ' ', 'g'))) = p."normalized_title"
  AND f."subject_page_id" IS NULL;
--> statement-breakpoint

-- Attach other subject claims only when the project's label maps to one page.
WITH unique_pages AS (
  SELECT "project_id", "normalized_title", min("id") AS "id"
  FROM "project_brain_page"
  GROUP BY "project_id", "normalized_title"
  HAVING count(*) = 1
)
UPDATE "project_brain_fact" AS f
SET "subject_page_id" = p."id"
FROM unique_pages AS p
WHERE f."project_id" = p."project_id"
  AND lower(btrim(regexp_replace(f."subject", '[[:space:]]+', ' ', 'g'))) = p."normalized_title"
  AND lower(btrim(f."predicate")) <> 'entity type'
  AND f."subject_page_id" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_brain_alias" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "page_id" uuid NOT NULL REFERENCES "project_brain_page"("id") ON DELETE CASCADE,
  "source_fact_id" uuid NOT NULL REFERENCES "project_brain_fact"("id") ON DELETE CASCADE,
  "alias" varchar(160) NOT NULL,
  "normalized_alias" varchar(160) NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "project_brain_alias_source_identity_unique"
    UNIQUE ("project_id", "page_id", "normalized_alias", "source_fact_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_brain_alias_project_normalized_idx"
  ON "project_brain_alias" ("project_id", "normalized_alias");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_alias_page_idx"
  ON "project_brain_alias" ("page_id");
--> statement-breakpoint

-- Preserve review semantics: aliases reference their source fact and remain
-- proposals until that fact is accepted by the existing review flow.
INSERT INTO "project_brain_alias" (
  "project_id", "page_id", "source_fact_id", "alias", "normalized_alias", "created_at"
)
SELECT f."project_id", f."subject_page_id", f."id",
  btrim(f."object"), lower(btrim(regexp_replace(f."object", '[[:space:]]+', ' ', 'g'))),
  f."created_at"
FROM "project_brain_fact" AS f
WHERE lower(btrim(f."predicate")) IN ('alias', 'also known as')
  AND f."subject_page_id" IS NOT NULL
  AND btrim(f."object") <> ''
ON CONFLICT ("project_id", "page_id", "normalized_alias", "source_fact_id") DO NOTHING;
--> statement-breakpoint

-- Keep an immutable actor/endpoints record alongside the page's merged_into
-- pointer. A rollback of application code leaves this lineage data intact.
CREATE TABLE IF NOT EXISTS "project_brain_page_merge" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "survivor_page_id" uuid NOT NULL REFERENCES "project_brain_page"("id") ON DELETE CASCADE,
  "merged_page_id" uuid NOT NULL UNIQUE REFERENCES "project_brain_page"("id") ON DELETE CASCADE,
  "actor_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "entity_type" varchar(32) NOT NULL,
  "survivor_title" varchar(160) NOT NULL,
  "merged_title" varchar(160) NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_brain_page_merge_project_created_idx"
  ON "project_brain_page_merge" ("project_id", "created_at");
