-- Link each extracted fact directly to the immutable source revision used by
-- its run. Composite identity prevents a fact from pointing across projects
-- or source items.
CREATE UNIQUE INDEX IF NOT EXISTS "project_brain_source_version_identity_unique"
  ON "project_brain_source_version" ("id", "project_id", "source_item_id");
--> statement-breakpoint

ALTER TABLE "project_brain_fact"
  ADD COLUMN IF NOT EXISTS "source_version_id" uuid;
--> statement-breakpoint

UPDATE "project_brain_fact" AS fact
SET "source_version_id" = run."source_version_id"
FROM "project_brain_run" AS run
WHERE fact."run_id" = run."id"
  AND fact."project_id" = run."project_id"
  AND fact."source_item_id" = run."source_item_id"
  AND fact."source_version_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "project_brain_fact"
  ALTER COLUMN "source_version_id" SET NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "project_brain_fact"
    ADD CONSTRAINT "project_brain_fact_source_revision_fk"
    FOREIGN KEY ("source_version_id", "project_id", "source_item_id")
    REFERENCES "project_brain_source_version" ("id", "project_id", "source_item_id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_brain_fact_source_version_idx"
  ON "project_brain_fact" ("source_version_id");
