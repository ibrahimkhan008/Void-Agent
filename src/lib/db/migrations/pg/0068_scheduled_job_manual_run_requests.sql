CREATE TABLE "scheduled_job_manual_run_request" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "public"."user"("id") ON DELETE CASCADE,
  "scheduled_job_id" uuid REFERENCES "scheduled_job"("id") ON DELETE SET NULL,
  "request_key" varchar(200) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "claim_token" uuid,
  "claim_expires_at" timestamp,
  "scheduled_run_id" uuid REFERENCES "scheduled_run"("id") ON DELETE SET NULL,
  "last_error" text,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scheduled_job_manual_run_request_pk" PRIMARY KEY ("user_id", "request_key"),
  CONSTRAINT "scheduled_job_manual_run_request_status_check" CHECK ("status" IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT "scheduled_job_manual_run_request_attempts_check" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_job_manual_run_request_id_unique" ON "scheduled_job_manual_run_request" ("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_job_manual_run_request_pending_job_unique" ON "scheduled_job_manual_run_request" ("scheduled_job_id") WHERE "status" IN ('pending', 'processing');
--> statement-breakpoint
CREATE INDEX "scheduled_job_manual_run_request_claim_idx" ON "scheduled_job_manual_run_request" ("status", "claim_expires_at", "created_at");