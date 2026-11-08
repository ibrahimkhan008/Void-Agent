CREATE TABLE "project_brain_chat_source" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "chat_thread"("id") ON DELETE CASCADE,
  "owner_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "active_fingerprint" text,
  "last_enqueued_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_brain_chat_source_project_thread_unique"
    UNIQUE ("project_id", "thread_id"),
  CONSTRAINT "project_brain_chat_source_identity_unique"
    UNIQUE ("id", "project_id")
);
--> statement-breakpoint
CREATE INDEX "project_brain_chat_source_thread_idx"
  ON "project_brain_chat_source" ("thread_id");
--> statement-breakpoint
CREATE INDEX "project_brain_chat_source_owner_idx"
  ON "project_brain_chat_source" ("owner_user_id");
--> statement-breakpoint

ALTER TABLE "project_brain_source_version"
  ALTER COLUMN "source_item_id" DROP NOT NULL,
  ADD COLUMN "source_type" text NOT NULL DEFAULT 'document',
  ADD COLUMN "chat_source_id" uuid REFERENCES "project_brain_chat_source"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "project_brain_source_version"
  ADD CONSTRAINT "project_brain_source_version_source_kind_check"
  CHECK (("source_type" = 'document' AND "source_item_id" IS NOT NULL AND "chat_source_id" IS NULL)
      OR ("source_type" = 'chat' AND "source_item_id" IS NULL AND "chat_source_id" IS NOT NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX "project_brain_source_version_chat_identity_unique"
  ON "project_brain_source_version" ("id", "project_id", "chat_source_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "project_brain_source_version_chat_revision_unique"
  ON "project_brain_source_version" ("project_id", "chat_source_id", "source_fingerprint");
--> statement-breakpoint

ALTER TABLE "project_brain_run"
  ALTER COLUMN "source_item_id" DROP NOT NULL,
  ADD COLUMN "source_type" text NOT NULL DEFAULT 'document',
  ADD COLUMN "chat_source_id" uuid REFERENCES "project_brain_chat_source"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "project_brain_run"
  ADD CONSTRAINT "project_brain_run_source_kind_check"
  CHECK (("source_type" = 'document' AND "source_item_id" IS NOT NULL AND "chat_source_id" IS NULL)
      OR ("source_type" = 'chat' AND "source_item_id" IS NULL AND "chat_source_id" IS NOT NULL));
--> statement-breakpoint

ALTER TABLE "project_brain_fact"
  ALTER COLUMN "source_item_id" DROP NOT NULL,
  ADD COLUMN "source_type" text NOT NULL DEFAULT 'document',
  ADD COLUMN "chat_source_id" uuid REFERENCES "project_brain_chat_source"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "project_brain_fact"
  ADD CONSTRAINT "project_brain_fact_chat_source_revision_fk"
  FOREIGN KEY ("source_version_id", "project_id", "chat_source_id")
  REFERENCES "project_brain_source_version" ("id", "project_id", "chat_source_id") ON DELETE CASCADE,
  ADD CONSTRAINT "project_brain_fact_source_kind_check"
  CHECK (("source_type" = 'document' AND "source_item_id" IS NOT NULL AND "chat_source_id" IS NULL)
      OR ("source_type" = 'chat' AND "source_item_id" IS NULL AND "chat_source_id" IS NOT NULL));
--> statement-breakpoint

ALTER TABLE "project_brain_todo"
  ALTER COLUMN "source_item_id" DROP NOT NULL,
  ADD COLUMN "source_type" text NOT NULL DEFAULT 'document',
  ADD COLUMN "chat_source_id" uuid REFERENCES "project_brain_chat_source"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "project_brain_todo"
  ADD CONSTRAINT "project_brain_todo_source_kind_check"
  CHECK (("source_type" = 'document' AND "source_item_id" IS NOT NULL AND "chat_source_id" IS NULL)
      OR ("source_type" = 'chat' AND "source_item_id" IS NULL AND "chat_source_id" IS NOT NULL));
--> statement-breakpoint
CREATE INDEX "project_brain_todo_chat_source_idx"
  ON "project_brain_todo" ("chat_source_id");
--> statement-breakpoint

ALTER TABLE "project_brain_event"
  ALTER COLUMN "source_item_id" DROP NOT NULL,
  ADD COLUMN "source_type" text NOT NULL DEFAULT 'document',
  ADD COLUMN "chat_source_id" uuid REFERENCES "project_brain_chat_source"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "project_brain_event"
  ADD CONSTRAINT "project_brain_event_chat_source_revision_fk"
  FOREIGN KEY ("source_version_id", "project_id", "chat_source_id")
  REFERENCES "project_brain_source_version" ("id", "project_id", "chat_source_id") ON DELETE CASCADE,
  ADD CONSTRAINT "project_brain_event_source_kind_check"
  CHECK (("source_type" = 'document' AND "source_item_id" IS NOT NULL AND "chat_source_id" IS NULL)
      OR ("source_type" = 'chat' AND "source_item_id" IS NULL AND "chat_source_id" IS NOT NULL));
--> statement-breakpoint
CREATE INDEX "project_brain_event_chat_source_idx"
  ON "project_brain_event" ("chat_source_id");
