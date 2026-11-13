-- Per-user Void Agent MCP marketplace installs and private configuration.
CREATE TABLE IF NOT EXISTS "mcp_server_install" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "org_id" text,
  "mcp_server_id" uuid NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "mcp_server_install_user_id_mcp_server_id_unique"
    UNIQUE ("user_id", "mcp_server_id"),
  CONSTRAINT "mcp_server_install_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "mcp_server_install_mcp_server_id_mcp_server_id_fk"
    FOREIGN KEY ("mcp_server_id") REFERENCES "mcp_server"("id") ON DELETE CASCADE,
  CONSTRAINT "mcp_server_install_org_id_organization_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "mcp_server_install_user_id_idx"
  ON "mcp_server_install" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "mcp_server_install_mcp_server_id_idx"
  ON "mcp_server_install" USING btree ("mcp_server_id");
CREATE INDEX IF NOT EXISTS "mcp_server_install_org_id_idx"
  ON "mcp_server_install" USING btree ("org_id");
