import { type SQLWrapper, sql } from "drizzle-orm";
import {
  ProjectBrainRunTable,
  ProjectBrainSourceStateTable,
} from "lib/db/pg/schema.pg";

/** Return only facts/tasks derived from the revision currently selected for this project item. */
export function projectBrainRunIsActiveSourceRevision(
  runId: SQLWrapper,
  projectId: SQLWrapper,
  sourceItemId: SQLWrapper,
) {
  return sql<boolean>`EXISTS (
    SELECT 1
    FROM ${ProjectBrainRunTable} AS active_run
    INNER JOIN ${ProjectBrainSourceStateTable} AS active_source
      ON active_source.project_id = active_run.project_id
      AND active_source.source_item_id = active_run.source_item_id
      AND active_source.source_version_id = active_run.source_version_id
    WHERE active_run.id = ${runId}
      AND active_run.project_id = ${projectId}
      AND active_run.source_item_id = ${sourceItemId}
      AND active_source.updated_at >= (
        SELECT source_item.updated_at
        FROM collection_item AS source_item
        WHERE source_item.id = active_run.source_item_id
      )
  )`;
}
