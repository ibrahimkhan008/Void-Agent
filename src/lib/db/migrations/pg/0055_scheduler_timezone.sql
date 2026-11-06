-- Store the IANA timezone used to calculate each scheduled job's recurrence.
-- Existing jobs retain their current UTC execution behavior.
ALTER TABLE "scheduled_job"
  ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'UTC';
