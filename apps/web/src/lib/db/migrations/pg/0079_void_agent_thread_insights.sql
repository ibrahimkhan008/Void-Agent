ALTER TABLE "chat_thread"
  ADD COLUMN IF NOT EXISTS "insights_summary" text,
  ADD COLUMN IF NOT EXISTS "insights_decisions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "insights_action_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "insights_generated_at" timestamp,
  ADD COLUMN IF NOT EXISTS "insights_source_message_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "insights_source_last_message_id" text;

DO $$ BEGIN
  ALTER TABLE "chat_thread"
    ADD CONSTRAINT "chat_thread_insights_source_message_count_check"
    CHECK ("insights_source_message_count" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
