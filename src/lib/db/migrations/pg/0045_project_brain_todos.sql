CREATE TABLE IF NOT EXISTS "project_brain_todo" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "run_id" uuid NOT NULL REFERENCES "project_brain_run"("id") ON DELETE CASCADE,
  "source_item_id" uuid NOT NULL REFERENCES "collection_item"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  "details" varchar(1200) NOT NULL DEFAULT '',
  "evidence" varchar(1200) NOT NULL,
  "due_date" date,
  "dedupe_key" varchar(64) NOT NULL,
  "status" text NOT NULL DEFAULT 'proposed',
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" timestamp,
  CONSTRAINT "project_brain_todo_status_check" CHECK ("status" IN ('proposed', 'accepted', 'rejected', 'completed')),
  CONSTRAINT "project_brain_todo_run_dedupe_unique" UNIQUE ("run_id", "dedupe_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_todo_project_status_idx" ON "project_brain_todo" ("project_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_todo_source_idx" ON "project_brain_todo" ("source_item_id");
