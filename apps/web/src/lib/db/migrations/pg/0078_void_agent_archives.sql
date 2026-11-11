CREATE TABLE IF NOT EXISTS "void_agent_archive" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(100) NOT NULL,
  "description" varchar(500),
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "void_agent_archive_name_nonempty_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "void_agent_archive_id_owner_unique" UNIQUE ("id", "user_id")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "void_agent_archive_item" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "archive_id" uuid NOT NULL,
  "item_id" uuid NOT NULL REFERENCES "chat_thread"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "added_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "void_agent_archive_item_archive_owner_fk"
    FOREIGN KEY ("archive_id", "user_id")
    REFERENCES "void_agent_archive"("id", "user_id") ON DELETE CASCADE,
  CONSTRAINT "void_agent_archive_item_archive_item_unique"
    UNIQUE ("archive_id", "item_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "void_agent_archive_owner_updated_idx"
  ON "void_agent_archive" ("user_id", "updated_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "void_agent_archive_item_owner_added_idx"
  ON "void_agent_archive_item" ("user_id", "added_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "void_agent_archive_item_item_idx"
  ON "void_agent_archive_item" ("item_id");
