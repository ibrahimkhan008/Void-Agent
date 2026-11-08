-- Store only a digest of new public-share bearer tokens. Existing UUID export
-- links remain usable until their owner rotates or revokes them.
ALTER TABLE "chat_export"
  ADD COLUMN IF NOT EXISTS "share_token_hash" varchar(64),
  ADD COLUMN IF NOT EXISTS "legacy_share_enabled" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_export_share_token_hash_unique"
  ON "chat_export" ("share_token_hash")
  WHERE "share_token_hash" IS NOT NULL;
