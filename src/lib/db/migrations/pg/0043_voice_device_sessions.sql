CREATE TABLE IF NOT EXISTS "voice_device_session" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "device_id" uuid NOT NULL REFERENCES "voice_device"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "session_id" varchar(120) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'completed', 'interrupted')),
  "segment_count" integer NOT NULL DEFAULT 0 CHECK ("segment_count" >= 0 AND "segment_count" <= 500),
  "started_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_segment_at" timestamp,
  "finalized_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voice_device_session_device_session_unique" UNIQUE ("device_id", "session_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_device_session_user_started_idx" ON "voice_device_session" ("user_id", "started_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "voice_device_transcript_segment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_pk" uuid NOT NULL REFERENCES "voice_device_session"("id") ON DELETE CASCADE,
  "event_id" varchar(200) NOT NULL,
  "sequence_number" integer NOT NULL CHECK ("sequence_number" >= 0),
  "text" varchar(8000) NOT NULL,
  "language" varchar(32),
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voice_device_segment_session_event_unique" UNIQUE ("session_pk", "event_id"),
  CONSTRAINT "voice_device_segment_session_sequence_unique" UNIQUE ("session_pk", "sequence_number")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_device_segment_session_created_idx" ON "voice_device_transcript_segment" ("session_pk", "created_at");
