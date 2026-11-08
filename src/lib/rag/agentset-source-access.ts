import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  DocumentTable,
} from "lib/db/pg/schema.pg";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
} from "lib/projects/access";
import type { AgentsetProjectHit } from "./agentset-provider";

const MAX_HITS_TO_VERIFY = 8;

/**
 * Recheck every remote result against the current project collection mapping,
 * current source-owner allowlist, and ready local document rows. Remote
 * namespace metadata alone is not an authorization decision.
 */
export async function filterCurrentAgentsetProjectSources(input: {
  projectId: string;
  userId: string;
  hits: AgentsetProjectHit[];
}): Promise<AgentsetProjectHit[]> {
  if (!input.hits.length) return [];

  const access = await getProjectAccess(input.projectId, input.userId);
  if (!access || access.project.collectionIds.length === 0) return [];

  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (ownerIds.length === 0) return [];

  const candidates = input.hits.slice(0, MAX_HITS_TO_VERIFY).flatMap((hit) => {
    const metadata = hit.metadata;
    if (
      typeof metadata.collectionId !== "string" ||
      typeof metadata.collectionItemId !== "string" ||
      typeof metadata.documentId !== "string" ||
      typeof metadata.ownerUserId !== "string"
    ) {
      return [];
    }
    return [
      {
        hit,
        collectionId: metadata.collectionId,
        itemId: metadata.collectionItemId,
        documentId: metadata.documentId,
        ownerUserId: metadata.ownerUserId,
      },
    ];
  });
  if (!candidates.length) return [];

  const [rows] = await Promise.all([
    pgDb
      .select({
        collectionId: CollectionItemTable.collectionId,
        itemId: CollectionItemTable.id,
        documentId: DocumentTable.id,
        ownerUserId: CollectionTable.userId,
      })
      .from(CollectionItemTable)
      .innerJoin(
        CollectionTable,
        eq(CollectionTable.id, CollectionItemTable.collectionId),
      )
      .innerJoin(
        DocumentTable,
        eq(DocumentTable.collectionItemId, CollectionItemTable.id),
      )
      .where(
        and(
          inArray(
            CollectionItemTable.id,
            candidates.map((candidate) => candidate.itemId),
          ),
          inArray(
            DocumentTable.id,
            candidates.map((candidate) => candidate.documentId),
          ),
          inArray(
            CollectionItemTable.collectionId,
            access.project.collectionIds,
          ),
          inArray(CollectionTable.userId, ownerIds),
          eq(CollectionItemTable.status, "ready"),
        ),
      )
      .limit(MAX_HITS_TO_VERIFY),
  ]);

  const visible = new Set(
    rows.map(
      (row) =>
        `${row.collectionId}\0${row.itemId}\0${row.documentId}\0${row.ownerUserId}`,
    ),
  );

  return candidates
    .filter((candidate) =>
      visible.has(
        `${candidate.collectionId}\0${candidate.itemId}\0${candidate.documentId}\0${candidate.ownerUserId}`,
      ),
    )
    .map(({ hit }) => hit);
}
