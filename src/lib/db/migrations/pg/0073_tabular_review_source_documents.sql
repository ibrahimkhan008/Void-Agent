CREATE TABLE "tabular_review_source_document" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "document_id" uuid,
  "position" integer NOT NULL,
  CONSTRAINT "tabular_review_source_document_item_fk"
    FOREIGN KEY ("review_id", "item_id")
    REFERENCES "tabular_review_item"("review_id", "item_id") ON DELETE CASCADE,
  CONSTRAINT "tabular_review_source_document_document_fk"
    FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE SET NULL,
  CONSTRAINT "tabular_review_source_document_position_check"
    CHECK ("position" >= 0),
  CONSTRAINT "tabular_review_source_document_position_unique"
    UNIQUE ("review_id", "item_id", "position"),
  CONSTRAINT "tabular_review_source_document_document_unique"
    UNIQUE ("review_id", "item_id", "document_id")
);
--> statement-breakpoint
CREATE INDEX "tabular_review_source_document_review_item_idx"
  ON "tabular_review_source_document" ("review_id", "item_id");
--> statement-breakpoint
CREATE INDEX "tabular_review_source_document_document_idx"
  ON "tabular_review_source_document" ("document_id");
--> statement-breakpoint
INSERT INTO "tabular_review_source_document"
  ("review_id", "item_id", "document_id", "position")
SELECT
  "review_id",
  "item_id",
  "document_id",
  (ROW_NUMBER() OVER (
    PARTITION BY "review_id", "item_id"
    ORDER BY "created_at" ASC, "document_id" ASC
  ) - 1)::integer
FROM (
  SELECT
    tri."review_id",
    tri."item_id",
    d."id" AS "document_id",
    d."created_at"
  FROM "tabular_review_item" AS tri
  INNER JOIN "document" AS d
    ON d."collection_item_id" = tri."item_id"
) AS existing_sources;
