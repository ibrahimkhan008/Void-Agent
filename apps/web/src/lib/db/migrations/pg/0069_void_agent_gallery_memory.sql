-- Preserve Void Agent's agent gallery and personal-memory workflows.

ALTER TABLE "agent"
  ADD COLUMN IF NOT EXISTS "published_at" timestamp,
  ADD COLUMN IF NOT EXISTS "install_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "gallery_metadata" jsonb,
  ADD COLUMN IF NOT EXISTS "cover_image_url" text;
CREATE UNIQUE INDEX IF NOT EXISTS "agent_user_preset_id_unique"
  ON "agent" ("user_id", "preset_id") WHERE "preset_id" IS NOT NULL;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS "user_memory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "org_id" uuid,
  "content" text NOT NULL,
  "category" varchar(100),
  "embedding" vector(1536),
  "scope" varchar(16) DEFAULT 'user' NOT NULL,
  "scope_id" uuid,
  "source_message_id" text,
  "confidence" real,
  "is_pinned" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "user_memory_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "user_memory_source_message_id_chat_message_id_fk"
    FOREIGN KEY ("source_message_id") REFERENCES "chat_message"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "user_memory_user_id_idx" ON "user_memory" ("user_id");
CREATE INDEX IF NOT EXISTS "user_memory_user_scope_idx" ON "user_memory" ("user_id", "scope");
CREATE INDEX IF NOT EXISTS "user_memory_source_message_idx" ON "user_memory" ("source_message_id");
CREATE INDEX IF NOT EXISTS "user_memory_embedding_hnsw_idx"
  ON "user_memory" USING hnsw ("embedding" vector_cosine_ops);
