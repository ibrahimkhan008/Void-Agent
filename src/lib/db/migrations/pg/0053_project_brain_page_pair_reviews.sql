CREATE TABLE IF NOT EXISTS "project_brain_page_pair_review" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "first_page_id" uuid NOT NULL REFERENCES "project_brain_page"("id") ON DELETE CASCADE,
  "second_page_id" uuid NOT NULL REFERENCES "project_brain_page"("id") ON DELETE CASCADE,
  "actor_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "project_brain_page_pair_review_pair_unique"
    UNIQUE ("first_page_id", "second_page_id"),
  CONSTRAINT "project_brain_page_pair_review_sorted_check"
    CHECK ("first_page_id" < "second_page_id"),
  CONSTRAINT "project_brain_page_pair_review_distinct_check"
    CHECK ("first_page_id" <> "second_page_id")
);

CREATE INDEX IF NOT EXISTS "project_brain_page_pair_review_first_idx"
  ON "project_brain_page_pair_review" ("first_page_id");
CREATE INDEX IF NOT EXISTS "project_brain_page_pair_review_second_idx"
  ON "project_brain_page_pair_review" ("second_page_id");
