CREATE TABLE IF NOT EXISTS "project_brain_status_snapshot" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "generated_by_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "input_fingerprint" varchar(64) NOT NULL,
  "source_refs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "health" varchar(20) NOT NULL,
  "progress_pct" real,
  "summary" varchar(600) NOT NULL DEFAULT '',
  "blockers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "project_brain_status_snapshot_project_created_idx"
  ON "project_brain_status_snapshot" ("project_id", "created_at");
CREATE INDEX IF NOT EXISTS "project_brain_status_snapshot_fingerprint_idx"
  ON "project_brain_status_snapshot" ("project_id", "input_fingerprint");
