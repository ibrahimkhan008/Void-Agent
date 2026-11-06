CREATE TABLE IF NOT EXISTS "tabular_review" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "title" varchar(160) NOT NULL,
  "columns" jsonb NOT NULL,
  "status" varchar NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tabular_review_status_check" CHECK ("status" IN ('pending', 'generating', 'done', 'error'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tabular_review_user_id_idx" ON "tabular_review" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tabular_review_item" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL REFERENCES "tabular_review"("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "collection_item"("id") ON DELETE CASCADE,
  "row_index" integer NOT NULL,
  CONSTRAINT "tabular_review_item_unique" UNIQUE ("review_id", "item_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tabular_review_item_review_idx" ON "tabular_review_item" ("review_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tabular_review_cell" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL REFERENCES "tabular_review"("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "collection_item"("id") ON DELETE CASCADE,
  "column_id" varchar(64) NOT NULL,
  "value" text,
  "status" varchar NOT NULL DEFAULT 'pending',
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tabular_review_cell_unique" UNIQUE ("review_id", "item_id", "column_id"),
  CONSTRAINT "tabular_review_cell_status_check" CHECK ("status" IN ('pending', 'generating', 'done', 'error'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tabular_review_cell_review_idx" ON "tabular_review_cell" ("review_id");
