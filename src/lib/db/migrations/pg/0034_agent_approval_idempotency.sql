-- Bind user-confirmed agent creation retries to one persisted agent row.
-- Keep request keys and payload fingerprints out of Agent API projections.
CREATE TABLE IF NOT EXISTS "agent_approval_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "request_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "agent_id" uuid REFERENCES "agent"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "agent_approval_request_user_key_unique"
    UNIQUE ("user_id", "request_key")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "agent_approval_request_created_at_idx"
  ON "agent_approval_request" ("created_at");
