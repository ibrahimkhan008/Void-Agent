-- Void Hooks (master prompt §3.5): event-driven agent automation.
--
-- The inbound pipeline (endpoint → normalized delivery → outbox event) already
-- existed; what was missing is the execution half: a claimed `inbound.received`
-- outbox event must run the endpoint's bound agent — with idempotency, loop
-- prevention (cooldown + daily cap), and an audit trail.
--
-- `hook_run` is that audit + idempotency record: one row per outbox event,
-- UNIQUE on event_id so a re-claimed event can never double-run.
-- `inbound_endpoint.hook_config` carries the per-hook tuning.

CREATE TYPE "hook_run_status" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'skipped');

CREATE TABLE "hook_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"inbound_endpoint_id" uuid NOT NULL REFERENCES "inbound_endpoint"("id") ON DELETE CASCADE,
	"agent_id" uuid NOT NULL REFERENCES "agent"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"status" "hook_run_status" DEFAULT 'queued' NOT NULL,
	"thread_id" uuid,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hook_run_event_id_unique" UNIQUE ("event_id")
);
--> statement-breakpoint
CREATE INDEX "hook_run_user_created_idx" ON "hook_run" ("user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "hook_run_endpoint_created_idx" ON "hook_run" ("inbound_endpoint_id", "created_at" DESC);
--> statement-breakpoint
ALTER TABLE "inbound_endpoint" ADD COLUMN "hook_config" jsonb DEFAULT '{}'::jsonb NOT NULL;
