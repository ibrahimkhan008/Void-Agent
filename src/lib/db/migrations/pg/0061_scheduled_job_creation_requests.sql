-- Durable idempotency records for schedules created as part of an approved
-- agent proposal. ON DELETE SET NULL keeps a tombstone if the schedule is
-- later deleted, preventing an old approval retry from recreating it.
CREATE TABLE IF NOT EXISTS "scheduled_job_creation_request" (
  "user_id" uuid NOT NULL REFERENCES "public"."user"("id") ON DELETE CASCADE,
  "request_key" varchar(200) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "scheduled_job_id" uuid REFERENCES "public"."scheduled_job"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scheduled_job_creation_request_pk" PRIMARY KEY ("user_id", "request_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_job_creation_request_job_idx"
  ON "scheduled_job_creation_request" ("scheduled_job_id");
