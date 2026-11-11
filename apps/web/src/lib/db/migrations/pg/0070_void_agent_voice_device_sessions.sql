-- Void-Agent device sessions and transcript segments are intentionally
-- distinct from Better Chatbot's browser voice-session tables. This migration
-- is additive so it does not rewrite existing voice-session data.
CREATE TABLE IF NOT EXISTS "voice_device_session" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "device_id" uuid NOT NULL REFERENCES "voice_device"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "session_id" varchar(120) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "segment_count" integer NOT NULL DEFAULT 0,
  "started_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_segment_at" timestamp,
  "finalized_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voice_device_session_status_check"
    CHECK ("status" IN ('active', 'completed', 'interrupted')),
  CONSTRAINT "voice_device_session_segment_count_check"
    CHECK ("segment_count" >= 0 AND "segment_count" <= 500),
  CONSTRAINT "voice_device_session_device_session_unique"
    UNIQUE ("device_id", "session_id")
);
CREATE INDEX IF NOT EXISTS "voice_device_session_user_started_idx"
  ON "voice_device_session" ("user_id", "started_at");

CREATE TABLE IF NOT EXISTS "voice_device_transcript_segment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_pk" uuid NOT NULL
    REFERENCES "voice_device_session"("id") ON DELETE CASCADE,
  "event_id" varchar(200) NOT NULL,
  "sequence_number" integer NOT NULL,
  "text" varchar(8000) NOT NULL,
  "language" varchar(32),
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voice_device_segment_sequence_check"
    CHECK ("sequence_number" >= 0),
  CONSTRAINT "voice_device_segment_session_event_unique"
    UNIQUE ("session_pk", "event_id"),
  CONSTRAINT "voice_device_segment_session_sequence_unique"
    UNIQUE ("session_pk", "sequence_number")
);
CREATE INDEX IF NOT EXISTS "voice_device_segment_session_created_idx"
  ON "voice_device_transcript_segment" ("session_pk", "created_at");

-- New provisioning code uses hashed bootstrap secrets and encrypted bearer
-- tokens. Nullable additions allow existing registrations to remain readable;
-- the secure provisioning flow rejects legacy rows missing these values.
ALTER TABLE "voice_device_registration"
  ADD COLUMN IF NOT EXISTS "bootstrap_secret_hash" text,
  ADD COLUMN IF NOT EXISTS "encrypted_device_token" text,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
