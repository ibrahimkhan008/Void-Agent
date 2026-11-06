CREATE TABLE IF NOT EXISTS "voice_device_registration" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code_hash" text NOT NULL UNIQUE,
  "bootstrap_secret_hash" text NOT NULL,
  "device_type" varchar(64) NOT NULL CHECK ("device_type" = 'm5stack_atom_echo_s3r'),
  "firmware_version" varchar(40),
  "hardware_id" varchar(64),
  "status" varchar(16) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'claimed', 'completed', 'expired')),
  "user_id" uuid REFERENCES "user"("id") ON DELETE CASCADE,
  "organization_id" text,
  "device_id" uuid REFERENCES "voice_device"("id") ON DELETE SET NULL,
  "display_name" varchar(80),
  "encrypted_device_token" text,
  "expires_at" timestamp NOT NULL,
  "claimed_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voice_device_registration_state_check" CHECK (
    ("status" = 'pending' AND "user_id" IS NULL AND "device_id" IS NULL AND "encrypted_device_token" IS NULL)
    OR ("status" = 'claimed' AND "user_id" IS NOT NULL AND "device_id" IS NOT NULL AND "encrypted_device_token" IS NOT NULL)
    OR ("status" IN ('completed', 'expired') AND "encrypted_device_token" IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_device_registration_user_idx" ON "voice_device_registration" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_device_registration_expiry_idx" ON "voice_device_registration" ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_device_registration_hardware_idx" ON "voice_device_registration" ("hardware_id");
