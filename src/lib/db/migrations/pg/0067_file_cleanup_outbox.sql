CREATE TABLE "file_cleanup_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"status" varchar NOT NULL DEFAULT 'pending',
	"attempts" integer NOT NULL DEFAULT 0,
	"next_attempt_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "file_cleanup_outbox_status_check" CHECK ("status" IN ('pending', 'processing', 'complete')),
	CONSTRAINT "file_cleanup_outbox_attempts_check" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "file_cleanup_outbox_status_next_attempt_idx" ON "file_cleanup_outbox" USING btree ("status", "next_attempt_at");
--> statement-breakpoint
CREATE INDEX "file_cleanup_outbox_storage_key_idx" ON "file_cleanup_outbox" USING btree ("storage_key");
