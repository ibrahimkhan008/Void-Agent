-- Void-Agent destination-only public API, embed, webhook and connector data.
-- These tables are additive to upstream's schema. Upstream's Better Auth
-- `apikey` table remains untouched; scoped REST keys use `api_key`.

ALTER TABLE "chat_export"
  ADD COLUMN IF NOT EXISTS "share_token_hash" varchar(64),
  ADD COLUMN IF NOT EXISTS "legacy_share_enabled" boolean DEFAULT true NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "chat_export_share_token_hash_unique"
  ON "chat_export" ("share_token_hash") WHERE "share_token_hash" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "api_key" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "key_hash" text NOT NULL,
  "prefix" text NOT NULL,
  "scopes" text[] DEFAULT '{}'::text[] NOT NULL,
  "last_used_at" timestamp,
  "expires_at" timestamp,
  "revoked_at" timestamp,
  "rotated_from_key_id" uuid,
  "rotation_grace_ends_at" timestamp,
  "last_four" text,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "api_key_rotated_from_key_id_api_key_id_fk" FOREIGN KEY ("rotated_from_key_id") REFERENCES "api_key"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "api_key_key_hash_unique" ON "api_key" ("key_hash");
CREATE INDEX IF NOT EXISTS "api_key_user_id_idx" ON "api_key" ("user_id");
CREATE INDEX IF NOT EXISTS "api_key_prefix_idx" ON "api_key" ("prefix");
CREATE INDEX IF NOT EXISTS "api_key_rotated_from_key_id_idx" ON "api_key" ("rotated_from_key_id");
CREATE INDEX IF NOT EXISTS "api_key_rotation_grace_ends_at_idx" ON "api_key" ("rotation_grace_ends_at");

CREATE TABLE IF NOT EXISTS "api_key_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "api_key_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "route" text NOT NULL,
  "method" text NOT NULL,
  "status" integer NOT NULL,
  "cost_units" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "api_key_usage_api_key_id_api_key_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "api_key"("id") ON DELETE CASCADE,
  CONSTRAINT "api_key_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "api_key_usage_api_key_id_created_at_idx" ON "api_key_usage" ("api_key_id", "created_at");
CREATE INDEX IF NOT EXISTS "api_key_usage_user_id_created_at_idx" ON "api_key_usage" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "api_rate_limit_bucket" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL UNIQUE,
  "count" integer DEFAULT 0 NOT NULL,
  "reset_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS "api_rate_limit_bucket_reset_at_idx" ON "api_rate_limit_bucket" ("reset_at");

CREATE TABLE IF NOT EXISTS "webhook_subscription" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "url" text NOT NULL,
  "event_types" text[] DEFAULT '{}'::text[] NOT NULL,
  "secret_hash" text NOT NULL,
  "signing_secret" text,
  "description" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "last_success_at" timestamp,
  "last_failure_at" timestamp,
  "last_failure_reason" text,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "webhook_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "webhook_subscription_user_id_idx" ON "webhook_subscription" ("user_id");
CREATE INDEX IF NOT EXISTS "webhook_subscription_enabled_idx" ON "webhook_subscription" ("enabled");
CREATE INDEX IF NOT EXISTS "webhook_subscription_user_id_enabled_idx" ON "webhook_subscription" ("user_id", "enabled");
CREATE INDEX IF NOT EXISTS "webhook_subscription_failure_count_idx" ON "webhook_subscription" ("failure_count");

CREATE TABLE IF NOT EXISTS "webhook_event_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" text NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "next_attempt_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "last_error" text,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS "webhook_event_outbox_status_next_attempt_at_idx" ON "webhook_event_outbox" ("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "webhook_event_outbox_event_type_idx" ON "webhook_event_outbox" ("event_type");
CREATE INDEX IF NOT EXISTS "webhook_event_outbox_kind_idx" ON "webhook_event_outbox" ("kind");
DO $$ BEGIN
  ALTER TABLE "webhook_event_outbox" ADD CONSTRAINT "webhook_event_outbox_kind_check" CHECK ("kind" IN ('inbound', 'outbound')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "webhook_event_outbox" ADD CONSTRAINT "webhook_event_outbox_status_check" CHECK ("status" IN ('pending', 'delivering', 'delivered', 'failed')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "webhook_delivery" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "subscription_id" uuid NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "delivered_at" timestamp,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "webhook_delivery_event_id_webhook_event_outbox_id_fk" FOREIGN KEY ("event_id") REFERENCES "webhook_event_outbox"("id") ON DELETE CASCADE,
  CONSTRAINT "webhook_delivery_subscription_id_webhook_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscription"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_delivery_event_subscription_unique" ON "webhook_delivery" ("event_id", "subscription_id");
CREATE INDEX IF NOT EXISTS "webhook_delivery_event_id_idx" ON "webhook_delivery" ("event_id");
CREATE INDEX IF NOT EXISTS "webhook_delivery_subscription_id_idx" ON "webhook_delivery" ("subscription_id");
CREATE INDEX IF NOT EXISTS "webhook_delivery_status_idx" ON "webhook_delivery" ("status");

CREATE TABLE IF NOT EXISTS "inbound_endpoint" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "agent_id" uuid NOT NULL,
  "token" text NOT NULL UNIQUE,
  "secret_hash" text,
  "kind" text NOT NULL,
  "thread_template" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "inbound_endpoint_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "inbound_endpoint_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agent"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "inbound_endpoint_user_id_idx" ON "inbound_endpoint" ("user_id");
CREATE INDEX IF NOT EXISTS "inbound_endpoint_kind_enabled_idx" ON "inbound_endpoint" ("kind", "enabled");

CREATE TABLE IF NOT EXISTS "inbound_delivery" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "inbound_endpoint_id" uuid NOT NULL,
  "received_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "status" text DEFAULT 'received' NOT NULL,
  "error" text,
  "payload" jsonb NOT NULL,
  CONSTRAINT "inbound_delivery_inbound_endpoint_id_inbound_endpoint_id_fk" FOREIGN KEY ("inbound_endpoint_id") REFERENCES "inbound_endpoint"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "inbound_delivery_inbound_endpoint_id_idx" ON "inbound_delivery" ("inbound_endpoint_id");
CREATE INDEX IF NOT EXISTS "inbound_delivery_status_received_at_idx" ON "inbound_delivery" ("status", "received_at");

CREATE TABLE IF NOT EXISTS "embed_session" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL,
  "user_id" uuid,
  "anonymous_token" text NOT NULL UNIQUE,
  "rate_limit_tier" text DEFAULT 'free' NOT NULL,
  "daily_message_count" integer DEFAULT 0 NOT NULL,
  "daily_reset_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "first_message_captcha_at" timestamp,
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "embed_session_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agent"("id") ON DELETE CASCADE,
  CONSTRAINT "embed_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "embed_session_agent_id_idx" ON "embed_session" ("agent_id");
CREATE INDEX IF NOT EXISTS "embed_session_anonymous_token_idx" ON "embed_session" ("anonymous_token");
CREATE INDEX IF NOT EXISTS "embed_session_expires_at_idx" ON "embed_session" ("expires_at");
CREATE INDEX IF NOT EXISTS "embed_session_revoked_at_idx" ON "embed_session" ("revoked_at");
DO $$ BEGIN
  ALTER TABLE "embed_session" ADD CONSTRAINT "embed_session_rate_limit_tier_check" CHECK ("rate_limit_tier" IN ('free', 'pro', 'team', 'business')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "user_connector" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" varchar NOT NULL,
  "email" text,
  "access_token" text,
  "refresh_token" text,
  "token_expires_at" timestamp,
  "scope" text,
  "is_connected" boolean DEFAULT false NOT NULL,
  "is_paused" boolean DEFAULT false NOT NULL,
  "last_sync_at" timestamp,
  "metadata" json,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "user_connector_user_id_provider_unique" UNIQUE ("user_id", "provider"),
  CONSTRAINT "user_connector_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "user_connector_user_id_idx" ON "user_connector" ("user_id");
CREATE INDEX IF NOT EXISTS "user_connector_provider_idx" ON "user_connector" ("provider");
