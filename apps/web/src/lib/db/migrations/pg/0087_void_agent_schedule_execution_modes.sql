-- Allow saved schedules to run either the standard Chat AI or the E2B-backed
-- Cloud Agent mode without requiring a custom Agent row. Existing schedules
-- retain execution_mode='agent' and their existing agent foreign key.
ALTER TABLE "scheduled_task"
  ADD COLUMN IF NOT EXISTS "execution_mode" varchar DEFAULT 'agent' NOT NULL;
--> statement-breakpoint

ALTER TABLE "scheduled_task"
  ALTER COLUMN "agent_id" DROP NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "scheduled_task"
    ADD CONSTRAINT "scheduled_task_execution_mode_check"
    CHECK ("execution_mode" IN ('agent', 'chat', 'cloud-agent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_task_user_key_unbound_idx"
  ON "scheduled_task" ("user_id", "key")
  WHERE "agent_id" IS NULL;
