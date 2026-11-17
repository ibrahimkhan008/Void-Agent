-- Persist bounded hook-chain input and depth on the idempotent run record.
ALTER TABLE "hook_run"
	ADD COLUMN "trigger_payload" jsonb,
	ADD COLUMN "chain_depth" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "hook_run"
	ADD CONSTRAINT "hook_run_chain_depth_check" CHECK ("chain_depth" BETWEEN 0 AND 3);
