-- Void Cyber Subsystem Migration
-- Creates all 8 tables for the Void Cyber security research platform

-- 1. cyber_researcher_profile
CREATE TABLE IF NOT EXISTS "cyber_researcher_profile" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_tier" integer NOT NULL DEFAULT 1,
  "role" varchar(32) NOT NULL DEFAULT 'researcher',
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "void_trust_score" integer NOT NULL DEFAULT 500,
  "mfa_enforced" boolean NOT NULL DEFAULT false,
  "invited_by_user_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_profile_role_idx" ON "cyber_researcher_profile" ("role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_profile_status_idx" ON "cyber_researcher_profile" ("status");
--> statement-breakpoint
-- 2. cyber_program
CREATE TABLE IF NOT EXISTS "cyber_program" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "program_handle" varchar(128) NOT NULL UNIQUE,
  "description" text,
  "policy_markdown" text,
  "has_bounties" boolean NOT NULL DEFAULT false,
  "currency" varchar(8) DEFAULT 'USD',
  "rules_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_program_handle_idx" ON "cyber_program" ("program_handle");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_program_creator_idx" ON "cyber_program" ("created_by_user_id");
--> statement-breakpoint
-- 3. cyber_program_scope
CREATE TABLE IF NOT EXISTS "cyber_program_scope" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "program_id" uuid NOT NULL REFERENCES "cyber_program"("id") ON DELETE CASCADE,
  "asset_identifier" text NOT NULL,
  "asset_type" varchar(32) NOT NULL,
  "is_in_scope" boolean NOT NULL DEFAULT true,
  "max_severity_allowed" varchar(32),
  "instruction_notes" text,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_scope_program_asset_idx" ON "cyber_program_scope" ("program_id", "asset_identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_scope_is_in_scope_idx" ON "cyber_program_scope" ("program_id", "is_in_scope");
--> statement-breakpoint
-- 4. cyber_session
CREATE TABLE IF NOT EXISTS "cyber_session" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "program_id" uuid NOT NULL REFERENCES "cyber_program"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'active',
  "sandbox_id" varchar(128),
  "sandbox_proxy_token" text,
  "assigned_agents" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_session_user_idx" ON "cyber_session" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_session_program_idx" ON "cyber_session" ("program_id");
--> statement-breakpoint
-- 5. cyber_finding
CREATE TABLE IF NOT EXISTS "cyber_finding" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "cyber_session"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "cwe_id" varchar(32),
  "cvss_score" varchar(16),
  "severity" varchar(32) NOT NULL,
  "affected_asset" text NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'candidate',
  "reproduction_steps" text NOT NULL,
  "proof_of_concept" text NOT NULL,
  "impact_description" text NOT NULL,
  "remediation_guidance" text,
  "raw_tool_outputs" jsonb DEFAULT '{}'::jsonb,
  "verification_log" text,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_finding_session_idx" ON "cyber_finding" ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_finding_severity_idx" ON "cyber_finding" ("severity");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_finding_status_idx" ON "cyber_finding" ("status");
--> statement-breakpoint
-- 6. cyber_evidence_vault
CREATE TABLE IF NOT EXISTS "cyber_evidence_vault" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "finding_id" uuid NOT NULL REFERENCES "cyber_finding"("id") ON DELETE CASCADE,
  "evidence_type" varchar(32) NOT NULL,
  "sha256_hash" varchar(64) NOT NULL,
  "payload_bytes" text NOT NULL,
  "captured_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_evidence_finding_idx" ON "cyber_evidence_vault" ("finding_id");
--> statement-breakpoint
-- 7. cyber_report
CREATE TABLE IF NOT EXISTS "cyber_report" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "finding_id" uuid NOT NULL REFERENCES "cyber_finding"("id") ON DELETE CASCADE,
  "report_format" varchar(32) NOT NULL DEFAULT 'markdown',
  "compiled_payload" jsonb NOT NULL,
  "quality_score" integer NOT NULL DEFAULT 0,
  "quality_feedback" jsonb DEFAULT '[]'::jsonb,
  "exported_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_report_finding_idx" ON "cyber_report" ("finding_id");
--> statement-breakpoint
-- 8. cyber_audit_event
CREATE TABLE IF NOT EXISTS "cyber_audit_event" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "cyber_session"("id") ON DELETE SET NULL,
  "event_type" varchar(64) NOT NULL,
  "severity" varchar(16) NOT NULL DEFAULT 'info',
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "timestamp" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_audit_user_idx" ON "cyber_audit_event" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_audit_session_idx" ON "cyber_audit_event" ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cyber_audit_event_type_idx" ON "cyber_audit_event" ("event_type");
