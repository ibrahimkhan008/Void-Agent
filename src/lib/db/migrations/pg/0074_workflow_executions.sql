CREATE TABLE "workflow_execution" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "workflow_id" uuid NOT NULL REFERENCES "workflow"("id") ON DELETE CASCADE,
  "workflow_name" varchar(160) NOT NULL,
  "graph_revision" varchar(64) NOT NULL,
  "input" jsonb NOT NULL,
  "progress" jsonb NOT NULL DEFAULT '{"completedNodes":{}}'::jsonb,
  "status" varchar(24) NOT NULL DEFAULT 'running',
  "pending_effect" jsonb,
  "approved_effect" jsonb,
  "error" varchar(500),
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_execution_status_check"
    CHECK ("status" IN ('running', 'awaiting_approval', 'effect_uncertain', 'completed', 'failed', 'cancelled')),
  CONSTRAINT "workflow_execution_graph_revision_check"
    CHECK ("graph_revision" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "workflow_execution_input_object_check"
    CHECK (jsonb_typeof("input") = 'object'),
  CONSTRAINT "workflow_execution_progress_object_check"
    CHECK (jsonb_typeof("progress") = 'object' AND jsonb_typeof("progress"->'completedNodes') = 'object'),
  CONSTRAINT "workflow_execution_pending_effect_object_check"
    CHECK ("pending_effect" IS NULL OR jsonb_typeof("pending_effect") = 'object'),
  CONSTRAINT "workflow_execution_approved_effect_object_check"
    CHECK ("approved_effect" IS NULL OR jsonb_typeof("approved_effect") = 'object'),
  CONSTRAINT "workflow_execution_approval_state_check"
    CHECK ("status" <> 'awaiting_approval' OR "pending_effect" IS NOT NULL),
  CONSTRAINT "workflow_execution_approval_status_check"
    CHECK ("status" <> 'running' OR "pending_effect" IS NULL)
);
--> statement-breakpoint
CREATE INDEX "workflow_execution_owner_status_updated_idx"
  ON "workflow_execution" ("user_id", "status", "updated_at");
--> statement-breakpoint
CREATE INDEX "workflow_execution_expiry_idx"
  ON "workflow_execution" ("expires_at");
