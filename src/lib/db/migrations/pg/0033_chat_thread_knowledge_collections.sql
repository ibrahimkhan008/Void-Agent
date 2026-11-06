-- Per-conversation knowledge scope. NULL preserves the existing behavior
-- (search all collections owned by the user); an empty array searches none.
ALTER TABLE "chat_thread"
ADD COLUMN IF NOT EXISTS "collection_ids" uuid[];
