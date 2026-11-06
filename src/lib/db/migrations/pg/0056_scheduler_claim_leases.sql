-- Persist worker ownership so overlapping ticks cannot execute one due job twice.
ALTER TABLE "scheduled_job"
  ADD COLUMN IF NOT EXISTS "claim_token" uuid,
  ADD COLUMN IF NOT EXISTS "claim_expires_at" timestamp;

CREATE INDEX IF NOT EXISTS "scheduled_job_claim_expiry_idx"
  ON "scheduled_job" ("claim_expires_at");
