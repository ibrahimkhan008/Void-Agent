-- Idempotent, owner-scoped manual run requests for scheduled tasks.
-- Retain request tombstones when the task is deleted so an idempotency key
-- cannot unexpectedly start a different task later.
CREATE TABLE IF NOT EXISTS "scheduled_task_manual_run_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scheduled_task_id" uuid,
  "user_id" uuid NOT NULL,
  "request_key" varchar(200) NOT NULL,
  "request_hash" text NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "claim_token" uuid,
  "claim_expires_at" timestamp,
  "attempts" integer DEFAULT 0 NOT NULL,
  "outcome" jsonb,
  "error" text,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "completed_at" timestamp,
  CONSTRAINT "scheduled_task_manual_run_status_check"
    CHECK ("status" IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT "scheduled_task_manual_run_attempts_check"
    CHECK ("attempts" >= 0),
  CONSTRAINT "scheduled_task_manual_run_task_fk"
    FOREIGN KEY ("scheduled_task_id") REFERENCES "scheduled_task"("id") ON DELETE SET NULL,
  CONSTRAINT "scheduled_task_manual_run_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_task_manual_run_user_key_unique"
  ON "scheduled_task_manual_run_request" USING btree ("user_id", "request_key");
CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_task_manual_run_active_task_unique"
  ON "scheduled_task_manual_run_request" USING btree ("scheduled_task_id")
  WHERE "status" IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS "scheduled_task_manual_run_claim_idx"
  ON "scheduled_task_manual_run_request" USING btree ("status", "claim_expires_at", "created_at");
