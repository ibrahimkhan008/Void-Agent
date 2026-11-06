CREATE TABLE IF NOT EXISTS "project_brain_contradiction" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "page_id" uuid REFERENCES "project_brain_page"("id") ON DELETE SET NULL,
  "fact_id_a" uuid NOT NULL REFERENCES "project_brain_fact"("id") ON DELETE CASCADE,
  "fact_id_b" uuid NOT NULL REFERENCES "project_brain_fact"("id") ON DELETE CASCADE,
  "verdict" varchar(20) NOT NULL DEFAULT 'potential' CHECK ("verdict" IN ('potential', 'contradiction', 'compatible', 'unknown')),
  "explanation" varchar(1200),
  "status" varchar(20) NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'resolved', 'dismissed')),
  "resolved_by_user_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "kept_fact_id" uuid REFERENCES "project_brain_fact"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_brain_contradiction_fact_pair_unique" UNIQUE ("fact_id_a", "fact_id_b"),
  CONSTRAINT "project_brain_contradiction_distinct_facts_check" CHECK ("fact_id_a" <> "fact_id_b"),
  CONSTRAINT "project_brain_contradiction_kept_fact_check" CHECK ("kept_fact_id" IS NULL OR "kept_fact_id" IN ("fact_id_a", "fact_id_b"))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_brain_contradiction_project_status_idx" ON "project_brain_contradiction" ("project_id", "status");
