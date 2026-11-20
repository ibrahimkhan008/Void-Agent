-- Void Cyber Agents & Per-User Quota Overrides Migration
ALTER TABLE "cyber_researcher_profile"
  ADD COLUMN IF NOT EXISTS "max_concurrent_agents" integer;
--> statement-breakpoint
ALTER TABLE "cyber_researcher_profile"
  ADD COLUMN IF NOT EXISTS "max_active_sessions" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cyber_agent" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" varchar(128) NOT NULL,
  "description" text,
  "system_prompt" text NOT NULL,
  "skill_slugs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sandbox_enabled" boolean NOT NULL DEFAULT true,
  "is_shared" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_agent_user_idx" ON "cyber_agent" ("user_id");
