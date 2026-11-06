import "server-only";

import { sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";

/**
 * Refresh page ranking from accepted facts in the currently selected source
 * revision. Collection scope is supplied from the caller's live project ACL.
 * The score mirrors the reference's recency, evidence volume, and source
 * diversity signals; link degree is derived from accepted relation facts.
 */
export async function recomputeProjectBrainSalience(input: {
  projectId: string;
  collectionIds: string[];
  ownerIds: string[];
}) {
  if (!input.collectionIds.length || !input.ownerIds.length)
    return { updated: 0 };

  const result = await pgDb.execute(sql`
    WITH visible_facts AS (
      SELECT f.id, f.subject_page_id, f.object_page_id, f.source_item_id,
        f.predicate, f.created_at
      FROM project_brain_fact f
      INNER JOIN collection_item ci ON ci.id = f.source_item_id
      INNER JOIN collection c ON c.id = ci.collection_id
      INNER JOIN project_brain_run active_run ON active_run.id = f.run_id
        AND active_run.project_id = f.project_id
        AND active_run.source_item_id = f.source_item_id
      INNER JOIN project_brain_source_state active_source
        ON active_source.project_id = f.project_id
        AND active_source.source_item_id = f.source_item_id
        AND active_source.source_version_id = active_run.source_version_id
        AND active_source.updated_at >= ci.updated_at
      WHERE f.project_id = ${input.projectId}::uuid
        AND c.id = ANY(${input.collectionIds}::uuid[])
        AND c.user_id = ANY(${input.ownerIds}::uuid[])
        AND ci.status = 'ready'
        AND f.review_status = 'accepted'
    ),
    page_facts AS (
      SELECT p.id AS page_id, count(DISTINCT f.id)::int AS fact_count,
        max(f.created_at) AS last_observed,
        count(DISTINCT f.source_item_id)::int AS source_count
      FROM project_brain_page p
      LEFT JOIN visible_facts f ON f.subject_page_id = p.id
      WHERE p.project_id = ${input.projectId}::uuid AND p.archived_at IS NULL
      GROUP BY p.id
    ),
    degree AS (
      SELECT page_id, count(DISTINCT fact_id)::int AS degree FROM (
        SELECT f.subject_page_id AS page_id, f.id AS fact_id
        FROM visible_facts f
        WHERE f.object_page_id IS NOT NULL
        UNION ALL
        SELECT f.object_page_id AS page_id, f.id AS fact_id
        FROM visible_facts f
        WHERE f.object_page_id IS NOT NULL
      ) links GROUP BY page_id
    ),
    scores AS (
      SELECT p.id,
        ln(1 + coalesce(d.degree, 0))
        + 0.5 * ln(1 + pf.fact_count)
        + CASE WHEN pf.last_observed IS NULL THEN 0 ELSE
          greatest(0, 1 - extract(epoch FROM (CURRENT_TIMESTAMP - pf.last_observed)) / (30 * 86400)) END
        + 0.3 * pf.source_count AS score
      FROM project_brain_page p
      INNER JOIN page_facts pf ON pf.page_id = p.id
      LEFT JOIN degree d ON d.page_id = p.id
      WHERE p.project_id = ${input.projectId}::uuid AND p.archived_at IS NULL
        AND pf.fact_count > 0
    )
    UPDATE project_brain_page p
    SET salience = round(scores.score::numeric, 3)
    FROM scores
    WHERE p.id = scores.id
      AND p.salience IS DISTINCT FROM round(scores.score::numeric, 3)
    RETURNING p.id
  `);

  return { updated: result.rows.length };
}
