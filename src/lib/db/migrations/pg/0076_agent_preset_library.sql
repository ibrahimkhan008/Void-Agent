-- Add a stable preset identity so adopting the same built-in template twice
-- cannot create duplicate agents for one user. Existing agents remain NULL.
ALTER TABLE "agent"
  ADD COLUMN IF NOT EXISTS "preset_id" varchar(100);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_user_preset_id_unique"
  ON "agent" ("user_id", "preset_id")
  WHERE "preset_id" IS NOT NULL;
