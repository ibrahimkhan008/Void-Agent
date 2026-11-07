-- Per-user encrypted credentials for the read-only financial Cockpit.
CREATE TABLE IF NOT EXISTS "cockpit_connection" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "team_id" uuid REFERENCES "team"("id") ON DELETE CASCADE,
  "provider" varchar(32) NOT NULL DEFAULT 'stripe',
  "secret_encrypted" text,
  "config_encrypted" text,
  "last_tested_at" timestamp,
  "last_test_ok" boolean,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cockpit_connection_provider_check" CHECK ("provider" IN ('stripe', 'vercel', 'website', 'revolut', 'superlog', 'seo')),
  CONSTRAINT "cockpit_connection_encrypted_config_check"
    CHECK ("secret_encrypted" IS NOT NULL OR "config_encrypted" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cockpit_connection_personal_provider_unique"
  ON "cockpit_connection" ("user_id", "provider") WHERE "team_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cockpit_connection_team_provider_unique"
  ON "cockpit_connection" ("team_id", "provider") WHERE "team_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cockpit_connection_user_idx"
  ON "cockpit_connection" ("user_id");
