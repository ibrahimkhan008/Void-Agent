import { type SQLWrapper, sql } from "drizzle-orm";
import {
  ProjectBrainChatSourceTable,
  ProjectBrainRunTable,
  ProjectBrainSourceStateTable,
} from "lib/db/pg/schema.pg";

/** Return results only for the active, still-authorized document or chat revision. */
export function projectBrainRunIsActiveSourceRevision(
  runId: SQLWrapper,
  projectId: SQLWrapper,
  sourceItemId: SQLWrapper,
  chatSourceId?: SQLWrapper,
) {
  return sql<boolean>`EXISTS (
    SELECT 1
    FROM ${ProjectBrainRunTable} AS active_run
    WHERE active_run.id = ${runId}
      AND active_run.project_id = ${projectId}
      AND (
        (
          active_run.source_type = 'document'
          AND active_run.source_item_id = ${sourceItemId}
          AND EXISTS (
            SELECT 1
            FROM ${ProjectBrainSourceStateTable} AS active_source
            WHERE active_source.project_id = active_run.project_id
              AND active_source.source_item_id = active_run.source_item_id
              AND active_source.source_version_id = active_run.source_version_id
              AND active_source.updated_at >= (
                SELECT source_item.updated_at
                FROM collection_item AS source_item
                WHERE source_item.id = active_run.source_item_id
              )
          )
        )
        OR (
          active_run.source_type = 'chat'
          AND active_run.chat_source_id = ${chatSourceId ?? sql`NULL`}
          AND EXISTS (
            SELECT 1
            FROM ${ProjectBrainChatSourceTable} AS active_chat_source
            INNER JOIN chat_thread AS active_thread
              ON active_thread.id = active_chat_source.thread_id
            WHERE active_chat_source.id = active_run.chat_source_id
              AND active_chat_source.project_id = active_run.project_id
              AND active_chat_source.active_fingerprint = active_run.source_fingerprint
              AND active_chat_source.revoked_at IS NULL
              AND active_thread.project_id = active_chat_source.project_id
              AND active_thread.user_id = active_chat_source.owner_user_id
          )
        )
      )
  )`;
}
