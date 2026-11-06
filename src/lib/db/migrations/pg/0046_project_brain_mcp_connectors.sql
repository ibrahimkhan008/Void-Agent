CREATE TABLE IF NOT EXISTS "project_brain_mcp_connector" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "credential_owner_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "mcp_server_id" uuid NOT NULL REFERENCES "mcp_server"("id") ON DELETE CASCADE,
  "collection_id" uuid NOT NULL REFERENCES "collection"("id") ON DELETE CASCADE,
  "display_name" varchar(160) NOT NULL,
  "tool_names" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'disabled')),
  "last_sync_at" timestamp,
  "last_error" text,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_brain_mcp_connector_project_server_unique" UNIQUE ("project_id", "mcp_server_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_mcp_connector_project_idx" ON "project_brain_mcp_connector" ("project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_brain_mcp_sync_run" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connector_id" uuid NOT NULL REFERENCES "project_brain_mcp_connector"("id") ON DELETE CASCADE,
  "requested_by_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "idempotency_key" varchar(128) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'running' CHECK ("status" IN ('running', 'completed', 'failed')),
  "source_item_id" uuid REFERENCES "collection_item"("id") ON DELETE SET NULL,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_brain_mcp_sync_idempotency_unique" UNIQUE ("connector_id", "idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_mcp_sync_run_connector_idx" ON "project_brain_mcp_sync_run" ("connector_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_brain_mcp_sync_source" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connector_id" uuid NOT NULL REFERENCES "project_brain_mcp_connector"("id") ON DELETE CASCADE,
  "source_item_id" uuid NOT NULL UNIQUE REFERENCES "collection_item"("id") ON DELETE CASCADE,
  "source_fingerprint" varchar(64) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_mcp_sync_source_connector_idx" ON "project_brain_mcp_sync_source" ("connector_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_brain_mcp_sync_source_fingerprint_unique" ON "project_brain_mcp_sync_source" ("connector_id", "source_fingerprint");
