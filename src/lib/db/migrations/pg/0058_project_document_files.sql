ALTER TABLE collection_item
  ADD COLUMN IF NOT EXISTS storage_key text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS project_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  collection_item_id uuid NOT NULL REFERENCES collection_item(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS project_document_project_item_idx
  ON project_document (project_id, collection_item_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS project_document_project_id_idx
  ON project_document (project_id);
