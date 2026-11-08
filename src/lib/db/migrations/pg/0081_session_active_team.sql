ALTER TABLE "session"
  ADD COLUMN IF NOT EXISTS "active_team_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_active_team_id_idx"
  ON "session" USING btree ("active_team_id");
