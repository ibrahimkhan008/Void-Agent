CREATE TABLE "project_brain_event" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "run_id" uuid NOT NULL REFERENCES "project_brain_run"("id") ON DELETE CASCADE,
  "source_version_id" uuid NOT NULL,
  "source_item_id" uuid NOT NULL REFERENCES "collection_item"("id") ON DELETE CASCADE,
  "summary" varchar(240) NOT NULL,
  "detail" varchar(1200),
  "evidence" varchar(1200) NOT NULL,
  "dedupe_key" varchar(64) NOT NULL,
  "event_date" date,
  "status" text NOT NULL DEFAULT 'proposed',
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" timestamp,
  CONSTRAINT "project_brain_event_source_revision_fk"
    FOREIGN KEY ("source_version_id", "project_id", "source_item_id")
    REFERENCES "project_brain_source_version"("id", "project_id", "source_item_id")
    ON DELETE CASCADE,
  CONSTRAINT "project_brain_event_status_check"
    CHECK ("status" IN ('proposed', 'accepted', 'rejected')),
  CONSTRAINT "project_brain_event_date_check"
    CHECK ("event_date" IS NULL OR "event_date" >= DATE '0001-01-01')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_brain_event_run_dedupe_unique"
  ON "project_brain_event" ("run_id", "dedupe_key");
--> statement-breakpoint
CREATE INDEX "project_brain_event_project_date_idx"
  ON "project_brain_event" ("project_id", "event_date" DESC, "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "project_brain_event_project_status_idx"
  ON "project_brain_event" ("project_id", "status");
--> statement-breakpoint
CREATE INDEX "project_brain_event_source_idx"
  ON "project_brain_event" ("source_item_id");
