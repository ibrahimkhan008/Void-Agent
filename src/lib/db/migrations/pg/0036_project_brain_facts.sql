-- A local, retry-safe project source analysis layer built on the existing
-- collection_item/document RAG pipeline. Facts remain proposals until reviewed.
CREATE TABLE IF NOT EXISTS "project_brain_run" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "source_item_id" uuid NOT NULL REFERENCES "collection_item"("id") ON DELETE CASCADE,
  "source_fingerprint" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "attempts" integer DEFAULT 1 NOT NULL,
  "fact_count" integer DEFAULT 0 NOT NULL,
  "error_message" text,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "project_brain_run_project_fingerprint_unique"
    UNIQUE ("project_id", "source_fingerprint")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_brain_run_project_created_idx"
  ON "project_brain_run" ("project_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_brain_fact" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "run_id" uuid NOT NULL REFERENCES "project_brain_run"("id") ON DELETE CASCADE,
  "source_item_id" uuid NOT NULL REFERENCES "collection_item"("id") ON DELETE CASCADE,
  "subject" varchar(160) NOT NULL,
  "predicate" varchar(160) NOT NULL,
  "object" varchar(500) NOT NULL,
  "evidence" varchar(1200) NOT NULL,
  "confidence" real DEFAULT 0.5 NOT NULL,
  "review_status" text DEFAULT 'proposed' NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "reviewed_at" timestamp
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_brain_fact_project_status_idx"
  ON "project_brain_fact" ("project_id", "review_status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_brain_fact_source_idx"
  ON "project_brain_fact" ("source_item_id");
