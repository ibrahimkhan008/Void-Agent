CREATE TABLE IF NOT EXISTS "problem_report" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "screenshots" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "context" jsonb,
  "status" varchar(16) NOT NULL DEFAULT 'open'
    CHECK ("status" IN ('open', 'in_review', 'resolved')),
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "problem_report_user_created_idx"
  ON "problem_report" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "problem_report_status_created_idx"
  ON "problem_report" ("status", "created_at");
