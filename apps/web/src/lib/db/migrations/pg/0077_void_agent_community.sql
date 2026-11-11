CREATE TABLE IF NOT EXISTS "community_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "storage_key" text NOT NULL UNIQUE,
  "filename" varchar(255) NOT NULL,
  "content_type" varchar(64) NOT NULL,
  "size" integer NOT NULL,
  "attached_at" timestamp,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "community_media_size_check" CHECK ("size" > 0 AND "size" <= 10485760),
  CONSTRAINT "community_media_type_check" CHECK ("content_type" IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'))
);
CREATE INDEX IF NOT EXISTS "community_media_user_created_idx" ON "community_media" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "community_post" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "author_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "author_name" varchar(128) NOT NULL,
  "author_avatar" text,
  "type" varchar(16) NOT NULL,
  "content" varchar(5000) NOT NULL,
  "media_id" uuid UNIQUE REFERENCES "community_media"("id") ON DELETE SET NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "shares" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "community_post_type_check" CHECK ("type" IN ('text', 'media', 'research')),
  CONSTRAINT "community_post_shares_check" CHECK ("shares" >= 0)
);
CREATE INDEX IF NOT EXISTS "community_post_created_idx" ON "community_post" ("created_at");
CREATE INDEX IF NOT EXISTS "community_post_author_created_idx" ON "community_post" ("author_id", "created_at");

CREATE TABLE IF NOT EXISTS "community_reaction" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL REFERENCES "community_post"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" varchar(16) NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "community_reaction_type_check" CHECK ("type" IN ('like', 'bookmark'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "community_reaction_user_post_type_uidx" ON "community_reaction" ("user_id", "post_id", "type");
CREATE INDEX IF NOT EXISTS "community_reaction_post_type_idx" ON "community_reaction" ("post_id", "type");
