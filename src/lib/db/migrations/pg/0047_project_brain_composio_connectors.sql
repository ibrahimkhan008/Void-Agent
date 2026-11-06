CREATE TABLE IF NOT EXISTS "project_brain_composio_connector" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "credential_owner_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "collection_id" uuid NOT NULL REFERENCES "collection"("id") ON DELETE CASCADE,
  "toolkit_slug" varchar(128) NOT NULL,
  "connected_account_id" varchar(256) NOT NULL,
  "display_name" varchar(160) NOT NULL,
  "read_action_slugs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'disabled')),
  "last_sync_at" timestamp,
  "last_error" text,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_brain_composio_connector_identity_unique" UNIQUE ("project_id", "connected_account_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_composio_connector_project_idx" ON "project_brain_composio_connector" ("project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_brain_composio_sync_run" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connector_id" uuid NOT NULL REFERENCES "project_brain_composio_connector"("id") ON DELETE CASCADE,
  "requested_by_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "idempotency_key" varchar(128) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'running' CHECK ("status" IN ('running', 'completed', 'failed')),
  "source_item_id" uuid REFERENCES "collection_item"("id") ON DELETE SET NULL,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_brain_composio_sync_idempotency_unique" UNIQUE ("connector_id", "idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_composio_sync_run_connector_idx" ON "project_brain_composio_sync_run" ("connector_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_brain_composio_sync_source" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connector_id" uuid NOT NULL REFERENCES "project_brain_composio_connector"("id") ON DELETE CASCADE,
  "source_item_id" uuid NOT NULL UNIQUE REFERENCES "collection_item"("id") ON DELETE CASCADE,
  "source_fingerprint" varchar(64) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_brain_composio_sync_source_fingerprint_unique" UNIQUE ("connector_id", "source_fingerprint")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_composio_sync_source_connector_idx" ON "project_brain_composio_sync_source" ("connector_id");
