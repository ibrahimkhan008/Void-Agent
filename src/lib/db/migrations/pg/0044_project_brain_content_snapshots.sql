-- Preserve the exact bounded input used for project-brain analysis so queued
-- runs remain tied to their immutable source revision.
ALTER TABLE "project_brain_source_version"
  ADD COLUMN IF NOT EXISTS "content_snapshot" text;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "project_brain_source_version"
    ADD CONSTRAINT "project_brain_source_version_content_snapshot_length_check"
    CHECK ("content_snapshot" IS NULL OR char_length("content_snapshot") <= 60000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
