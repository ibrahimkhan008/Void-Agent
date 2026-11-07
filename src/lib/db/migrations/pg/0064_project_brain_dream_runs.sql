-- Durable, idempotent project-brain consolidation queue.
CREATE TABLE IF NOT EXISTS "project_brain_dream_run" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "requested_by_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "reason" text NOT NULL CHECK ("reason" IN ('manual', 'nightly')),
  "idempotency_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued', 'running', 'partial', 'succeeded', 'failed')),
  "stage" text NOT NULL DEFAULT 'dedupe' CHECK ("stage" IN ('dedupe', 'contradictions', 'salience', 'archive', 'done')),
  "attempts" integer NOT NULL DEFAULT 0,
  "metrics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" timestamp,
  "finished_at" timestamp,
  CONSTRAINT "project_brain_dream_project_idempotency_unique" UNIQUE ("project_id", "idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_dream_status_created_idx" ON "project_brain_dream_run" ("status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_dream_project_created_idx" ON "project_brain_dream_run" ("project_id", "created_at");
