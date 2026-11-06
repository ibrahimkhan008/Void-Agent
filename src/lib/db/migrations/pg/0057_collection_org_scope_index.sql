-- Team-scoped knowledge collections are listed by current membership and
-- joined during RAG retrieval; index the existing nullable scope column.
CREATE INDEX IF NOT EXISTS collection_org_id_idx ON collection (org_id);
