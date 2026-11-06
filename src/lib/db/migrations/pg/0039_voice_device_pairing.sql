CREATE TABLE IF NOT EXISTS "voice_device" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "organization_id" text,
  "device_type" varchar(64) NOT NULL,
  "display_name" varchar(80) NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "status" varchar(16) NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'revoked')),
  CONSTRAINT "voice_device_type_check" CHECK ("device_type" = 'm5stack_atom_echo_s3r'),
  "firmware_version" varchar(40),
  "last_seen_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_device_user_idx" ON "voice_device" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_device_status_idx" ON "voice_device" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "voice_device_pairing_code" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "organization_id" text,
  "device_type" varchar(64) NOT NULL,
  "display_name" varchar(80),
  "code_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voice_pairing_device_type_check" CHECK ("device_type" = 'm5stack_atom_echo_s3r')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_pairing_user_idx" ON "voice_device_pairing_code" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_pairing_expires_idx" ON "voice_device_pairing_code" ("expires_at");
