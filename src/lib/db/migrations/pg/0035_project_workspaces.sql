-- Restore project workspaces using Void-Agent's team membership and existing
-- collection/RAG contracts. Older project data was converted to agents and
-- archives by migration 0008; this creates fresh workspace rows without
-- changing that historical migration or deleting current archive data.
CREATE TABLE IF NOT EXISTS "project" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "team_id" uuid REFERENCES "team"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "goal" text,
  "system_prompt" text,
  "collection_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_user_id_idx" ON "project" ("user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_team_id_idx" ON "project" ("team_id");
--> statement-breakpoint

ALTER TABLE "chat_thread"
  ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "project"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_thread_project_id_idx"
  ON "chat_thread" ("project_id");
