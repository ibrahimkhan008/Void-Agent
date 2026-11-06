-- Project collaboration is opt-in. Existing rows default to inherited team
-- access, preserving current team-wide visibility and permissions.
ALTER TABLE "project"
  ADD COLUMN IF NOT EXISTS "access_mode" text NOT NULL DEFAULT 'team';
--> statement-breakpoint

ALTER TABLE "project"
  ADD CONSTRAINT "project_access_mode_check"
  CHECK ("access_mode" IN ('team', 'selected'));
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_member" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'viewer' NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "project_member_role_check" CHECK ("role" IN ('viewer', 'editor')),
  CONSTRAINT "project_member_project_id_user_id_unique" UNIQUE ("project_id", "user_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_member_project_id_idx"
  ON "project_member" ("project_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_member_user_id_idx"
  ON "project_member" ("user_id");
