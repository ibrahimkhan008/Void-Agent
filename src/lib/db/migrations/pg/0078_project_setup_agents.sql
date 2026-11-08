ALTER TABLE "project"
  ADD COLUMN IF NOT EXISTS "onboarding_step" text NOT NULL DEFAULT 'goal',
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamp;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_agent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "agent"("id") ON DELETE CASCADE,
  "added_by_user_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "project_agent_project_id_agent_id_unique" UNIQUE ("project_id", "agent_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_agent_project_id_idx"
  ON "project_agent" ("project_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_agent_agent_id_idx"
  ON "project_agent" ("agent_id");
