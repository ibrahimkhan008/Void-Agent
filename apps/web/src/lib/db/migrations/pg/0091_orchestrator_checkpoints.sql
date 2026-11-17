CREATE TABLE "orchestrator_checkpoint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"thread_id" uuid NOT NULL REFERENCES "chat_thread"("id") ON DELETE CASCADE,
	"objective" text NOT NULL,
	"workers" jsonb NOT NULL,
	"completed_workers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_criteria" text,
	"status" varchar(16) DEFAULT 'running' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "orchestrator_checkpoint_status_check" CHECK ("status" IN ('running', 'verifying', 'failed', 'done')),
	CONSTRAINT "orchestrator_checkpoint_objective_length_check" CHECK (length(trim("objective")) BETWEEN 1 AND 8000)
);
--> statement-breakpoint
CREATE INDEX "orchestrator_checkpoint_owner_thread_idx"
	ON "orchestrator_checkpoint" ("user_id", "thread_id", "updated_at");
