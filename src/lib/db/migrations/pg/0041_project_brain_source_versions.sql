-- Keep immutable source revision metadata without copying raw document contents.
CREATE TABLE IF NOT EXISTS "project_brain_source_version" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "source_item_id" uuid NOT NULL REFERENCES "collection_item"("id") ON DELETE CASCADE,
  "source_fingerprint" text NOT NULL,
  "content_length" integer NOT NULL CHECK ("content_length" >= 0 AND "content_length" <= 60000),
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_brain_source_version_revision_unique"
    UNIQUE ("project_id", "source_item_id", "source_fingerprint")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_brain_source_version_item_created_idx"
  ON "project_brain_source_version" ("project_id", "source_item_id", "created_at");
--> statement-breakpoint

-- Backfill lineage for existing analyses. Their historical text length was not
-- recorded, so zero denotes legacy/unknown metadata and is never used as proof
-- that a newly queued source is unchanged.
INSERT INTO "project_brain_source_version" (
  "project_id", "source_item_id", "source_fingerprint", "content_length", "created_at"
)
SELECT "project_id", "source_item_id", "source_fingerprint", 0, MIN("created_at")
FROM "project_brain_run"
GROUP BY "project_id", "source_item_id", "source_fingerprint"
ON CONFLICT ("project_id", "source_item_id", "source_fingerprint") DO NOTHING;
--> statement-breakpoint

ALTER TABLE "project_brain_run"
  ADD COLUMN IF NOT EXISTS "source_version_id" uuid;
--> statement-breakpoint

UPDATE "project_brain_run" AS run
SET "source_version_id" = version."id"
FROM "project_brain_source_version" AS version
WHERE run."project_id" = version."project_id"
  AND run."source_item_id" = version."source_item_id"
  AND run."source_fingerprint" = version."source_fingerprint"
  AND run."source_version_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "project_brain_run"
  ALTER COLUMN "source_version_id" SET NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "project_brain_run"
    ADD CONSTRAINT "project_brain_run_source_version_id_fk"
    FOREIGN KEY ("source_version_id")
    REFERENCES "project_brain_source_version"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_brain_run_source_version_idx"
  ON "project_brain_run" ("source_version_id");
