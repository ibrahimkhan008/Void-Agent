-- C44 — Bug Bounty port (from the destination repo's Flare bug bounty).
-- User-owned `bug_report` rows triaged by admins through repository-only
-- admin paths, with `bug_report_comment` threads (admin-only notes flagged
-- `is_internal`). Program settings live in `site_config` (key "bug-bounty"),
-- not here. The CHECK constraints mirror the zod bounds enforced by the
-- /api/bug-bounty routes; they are last-resort guards, never the primary
-- validation.

CREATE TABLE IF NOT EXISTS "bug_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" varchar DEFAULT 'medium' NOT NULL,
	"category" varchar(64) DEFAULT 'other' NOT NULL,
	"affected_area" text,
	"reproduction_steps" text DEFAULT '' NOT NULL,
	"impact" text DEFAULT '' NOT NULL,
	"proof_of_concept" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"awarded_amount_cents" integer,
	"awarded_currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"awarded_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "bug_report_title_length_check"
		CHECK (char_length("title") BETWEEN 8 AND 160),
	CONSTRAINT "bug_report_description_length_check"
		CHECK (char_length("description") BETWEEN 20 AND 20000),
	CONSTRAINT "bug_report_severity_check"
		CHECK ("severity" IN ('low', 'medium', 'high', 'critical')),
	CONSTRAINT "bug_report_status_check"
		CHECK ("status" IN ('pending', 'triaging', 'accepted', 'duplicate', 'rejected', 'awarded')),
	CONSTRAINT "bug_report_affected_area_length_check"
		CHECK ("affected_area" IS NULL OR char_length("affected_area") <= 200),
	CONSTRAINT "bug_report_reproduction_steps_length_check"
		CHECK (char_length("reproduction_steps") <= 10000),
	CONSTRAINT "bug_report_impact_length_check"
		CHECK (char_length("impact") <= 10000),
	CONSTRAINT "bug_report_proof_of_concept_length_check"
		CHECK ("proof_of_concept" IS NULL OR char_length("proof_of_concept") <= 10000),
	CONSTRAINT "bug_report_awarded_amount_cents_check"
		CHECK ("awarded_amount_cents" IS NULL OR "awarded_amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bug_report_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL REFERENCES "bug_report"("id") ON DELETE CASCADE,
	"user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "bug_report_comment_body_length_check"
		CHECK (char_length("body") BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bug_report_user_id_idx" ON "bug_report" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bug_report_status_idx" ON "bug_report" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bug_report_created_at_idx" ON "bug_report" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bug_report_severity_idx" ON "bug_report" ("severity");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bug_report_comment_report_id_idx" ON "bug_report_comment" ("report_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bug_report_comment_user_id_idx" ON "bug_report_comment" ("user_id");
