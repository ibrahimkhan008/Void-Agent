-- Make project source analysis resumable outside the user's request lifecycle.
-- Existing runs belong to the project owner; subsequent runs record the actor.
ALTER TABLE "project_brain_run"
  ADD COLUMN IF NOT EXISTS "requested_by_user_id" uuid;
--> statement-breakpoint

UPDATE "project_brain_run" AS run
SET "requested_by_user_id" = project."user_id"
FROM "project" AS project
WHERE run."project_id" = project."id"
  AND run."requested_by_user_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "project_brain_run"
  ALTER COLUMN "requested_by_user_id" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "project_brain_run"
  ADD CONSTRAINT "project_brain_run_requested_by_user_id_user_id_fk"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "project_brain_run"
  ALTER COLUMN "status" SET DEFAULT 'queued';
--> statement-breakpoint

ALTER TABLE "project_brain_run"
  ALTER COLUMN "attempts" SET DEFAULT 0;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_brain_run_queue_status_created_idx"
  ON "project_brain_run" ("status", "created_at");
