CREATE TABLE IF NOT EXISTS "project_brain_source_state" (
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "source_item_id" uuid NOT NULL REFERENCES "collection_item"("id") ON DELETE CASCADE,
  "source_version_id" uuid NOT NULL REFERENCES "project_brain_source_version"("id") ON DELETE CASCADE,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_brain_source_state_pk" PRIMARY KEY ("project_id", "source_item_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_brain_source_state_version_idx"
  ON "project_brain_source_state" ("source_version_id");
--> statement-breakpoint

-- Seed each source with the revision from its most recently queued/processed run.
-- Subsequent validated enqueue operations atomically replace this active pointer.
INSERT INTO "project_brain_source_state" (
  "project_id", "source_item_id", "source_version_id", "updated_at"
)
SELECT DISTINCT ON (run."project_id", run."source_item_id")
  run."project_id", run."source_item_id", run."source_version_id", CURRENT_TIMESTAMP
FROM "project_brain_run" AS run
ORDER BY run."project_id", run."source_item_id", run."created_at" DESC, run."id" DESC
ON CONFLICT ("project_id", "source_item_id") DO NOTHING;
