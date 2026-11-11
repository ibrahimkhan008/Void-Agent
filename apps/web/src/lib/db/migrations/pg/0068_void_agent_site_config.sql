-- Void-Agent admin configuration required by dynamic providers and API keys.
-- These tables do not exist in the upstream schema. IF NOT EXISTS preserves
-- destination data when this additive migration is run on an existing DB.
CREATE TABLE IF NOT EXISTS "site_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "settings" json NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "site_config_key_unique" UNIQUE ("key")
);

CREATE TABLE IF NOT EXISTS "site_config_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "settings" json NOT NULL,
  "changed_by" uuid NOT NULL,
  "changed_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "change_type" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "site_config_audit_key_idx"
  ON "site_config_audit" USING btree ("key");

-- Void-Agent account metadata used by subscription/admin workflows.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "tier" varchar DEFAULT 'free' NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "created_ip" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "last_ip" text;

-- Void-Agent MCP gallery metadata and agent-install persistence.
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "curated" boolean DEFAULT false NOT NULL;
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "category" varchar(64);
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "install_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "mcp_server" ADD COLUMN IF NOT EXISTS "homepage_url" text;
CREATE INDEX IF NOT EXISTS "mcp_server_curated_idx"
  ON "mcp_server" USING btree ("curated", "install_count" DESC);
CREATE INDEX IF NOT EXISTS "mcp_server_category_idx"
  ON "mcp_server" USING btree ("category");

CREATE TABLE IF NOT EXISTS "agent_install" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "org_id" uuid,
  "agent_id" uuid NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "agent_install_user_id_agent_id_unique"
    UNIQUE ("user_id", "agent_id"),
  CONSTRAINT "agent_install_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "agent_install_agent_id_agent_id_fk"
    FOREIGN KEY ("agent_id") REFERENCES "agent"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "agent_install_user_id_idx"
  ON "agent_install" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "agent_install_agent_id_idx"
  ON "agent_install" USING btree ("agent_id");
CREATE INDEX IF NOT EXISTS "agent_install_org_id_idx"
  ON "agent_install" USING btree ("org_id");

-- Per-user n8n account mapping used by workflow proxy routes.
CREATE TABLE IF NOT EXISTS "n8n_user" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "n8n_user_id" text NOT NULL,
  "api_key" text NOT NULL,
  "email" text,
  "password" text,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "n8n_user_user_id_unique" UNIQUE ("user_id"),
  CONSTRAINT "n8n_user_user_id_user_id_fk" FOREIGN KEY ("user_id")
    REFERENCES "user"("id") ON DELETE CASCADE
);
