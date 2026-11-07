CREATE UNIQUE INDEX "project_document_project_id_unique_idx"
  ON "project_document" ("project_id", "id");
--> statement-breakpoint
CREATE TABLE "project_document_edit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "project_document_id" uuid NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "source_revision_hash" varchar(64) NOT NULL,
  "proposed_edits" jsonb NOT NULL,
  "tracked_changes" jsonb NOT NULL,
  "candidate_storage_key" text,
  "output_storage_key" text,
  "status" varchar NOT NULL DEFAULT 'pending',
  "resolved_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_document_edit_project_document_fk"
    FOREIGN KEY ("project_id", "project_document_id")
    REFERENCES "project_document"("project_id", "id") ON DELETE CASCADE,
  CONSTRAINT "project_document_edit_source_hash_check" CHECK ("source_revision_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "project_document_edit_edits_check" CHECK (
    jsonb_typeof("proposed_edits") = 'array'
    AND jsonb_array_length("proposed_edits") BETWEEN 1 AND 50
  ),
  CONSTRAINT "project_document_edit_tracked_changes_check" CHECK (
    jsonb_typeof("tracked_changes") = 'array'
    AND jsonb_array_length("tracked_changes") BETWEEN 1 AND 50
  ),
  CONSTRAINT "project_document_edit_status_check" CHECK ("status" IN ('pending', 'accepted', 'rejected', 'stale')),
  CONSTRAINT "project_document_edit_lifecycle_check" CHECK (
    ("status" = 'pending' AND "candidate_storage_key" IS NOT NULL AND "output_storage_key" IS NULL AND "resolved_at" IS NULL)
    OR ("status" = 'accepted' AND "candidate_storage_key" IS NULL AND "output_storage_key" IS NOT NULL AND "resolved_at" IS NOT NULL)
    OR ("status" IN ('rejected', 'stale') AND "candidate_storage_key" IS NULL AND "output_storage_key" IS NULL AND "resolved_at" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX "project_document_edit_project_created_idx"
  ON "project_document_edit" ("project_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "project_document_edit_document_created_idx"
  ON "project_document_edit" ("project_document_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "project_document_edit_status_created_idx"
  ON "project_document_edit" ("status", "created_at");
--> statement-breakpoint
CREATE FUNCTION "queue_project_document_edit_cleanup"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."candidate_storage_key" IS NOT NULL THEN
    INSERT INTO "file_cleanup_outbox" ("user_id", "storage_key")
    VALUES (OLD."created_by_user_id", OLD."candidate_storage_key");
  END IF;
  IF OLD."output_storage_key" IS NOT NULL
     AND OLD."output_storage_key" IS DISTINCT FROM OLD."candidate_storage_key" THEN
    INSERT INTO "file_cleanup_outbox" ("user_id", "storage_key")
    VALUES (OLD."created_by_user_id", OLD."output_storage_key");
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "project_document_edit_cleanup_trigger"
AFTER DELETE ON "project_document_edit"
FOR EACH ROW EXECUTE FUNCTION "queue_project_document_edit_cleanup"();
