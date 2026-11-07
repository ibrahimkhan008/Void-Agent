import "server-only";

import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { isUserStorageKey } from "lib/file-storage/storage-utils";
import { pgDb as db } from "../db.pg";
import {
  CollectionEntity,
  CollectionItemEntity,
  CollectionItemStatus,
  CollectionItemTable,
  CollectionSourceType,
  CollectionTable,
  DocumentChunkTable,
  DocumentEntity,
  DocumentTable,
  FileCleanupOutboxTable,
  ProjectBrainComposioSyncRunTable,
  ProjectBrainComposioSyncSourceTable,
  ProjectBrainFactTable,
  ProjectBrainMcpSyncRunTable,
  ProjectBrainMcpSyncSourceTable,
  ProjectBrainRunTable,
  ProjectBrainSourceStateTable,
  ProjectBrainSourceVersionTable,
  ProjectBrainTodoTable,
  ProjectDocumentTable,
  TabularReviewCellTable,
  TabularReviewItemTable,
} from "../schema.pg";
import { formatEmbeddingForPg } from "./memory-helpers";

// ---------------------------------------------------------------------------
// P2.1 follow-up — the ingest side of RAG.
// ---------------------------------------------------------------------------
// `src/lib/rag/retrieve.ts` has always been able to read
// `document_chunk` rows, but nothing could ever write them: the
// repositories listed as a "Next Step" in the P2.2 context entry were
// never implemented, so the knowledge base had no ingest path at all.
//
// Ownership: every mutating call takes a `userId` and scopes through
// `collection.user_id`. `collection_item`, `document`, and
// `document_chunk` have no `user_id` of their own — they inherit it
// through the FK chain — so a caller that only holds an item/document id
// must go through `assertItemOwned` / `assertCollectionOwned` first.
// Skipping that check would be an IDOR (the same class of bug the
// 2026-03-26 audit fixed in the chat actions).
// ---------------------------------------------------------------------------

export interface CreateCollectionInput {
  name: string;
  description?: string | null;
  orgId?: string | null;
}

export interface CreateCollectionItemInput {
  collectionId: string;
  sourceType: CollectionSourceType;
  sourceUrl?: string | null;
  storageKey?: string | null;
  filename?: string | null;
  mediaType?: string | null;
  status?: CollectionItemStatus;
}

export interface InsertChunkInput {
  content: string;
  position: number;
  embedding: number[];
}

export const pgCollectionRepository = {
  // --- collections -------------------------------------------------------

  async createCollection(
    input: CreateCollectionInput,
    userId: string,
  ): Promise<CollectionEntity> {
    const [row] = await db
      .insert(CollectionTable)
      .values({
        userId,
        orgId: input.orgId ?? null,
        name: input.name,
        description: input.description ?? null,
      })
      .returning();
    return row as CollectionEntity;
  },

  async listCollections(userId: string): Promise<CollectionEntity[]> {
    return (await db
      .select()
      .from(CollectionTable)
      .where(eq(CollectionTable.userId, userId))
      .orderBy(desc(CollectionTable.createdAt))) as CollectionEntity[];
  },

  /** Personal collections plus collections in teams the caller currently belongs to. */
  async listAccessibleCollections(
    userId: string,
    teamIds: string[],
  ): Promise<CollectionEntity[]> {
    const scopes = [
      and(eq(CollectionTable.userId, userId), isNull(CollectionTable.orgId)),
    ];
    if (teamIds.length) {
      scopes.push(
        and(
          inArray(CollectionTable.orgId, teamIds),
          sql`(
            EXISTS (
              SELECT 1 FROM team_member tm
              WHERE tm.team_id = ${CollectionTable.orgId}
                AND tm.user_id = ${userId}
            )
            OR EXISTS (
              SELECT 1 FROM team t
              WHERE t.id = ${CollectionTable.orgId}
                AND t.owner_id = ${userId}
            )
          )`,
        ),
      );
    }
    return (await db
      .select()
      .from(CollectionTable)
      .where(or(...scopes))
      .orderBy(desc(CollectionTable.createdAt))) as CollectionEntity[];
  },

  /** Internal unscoped lookup; callers must immediately apply collection ACLs. */
  async getCollectionById(id: string): Promise<CollectionEntity | null> {
    const [row] = await db
      .select()
      .from(CollectionTable)
      .where(eq(CollectionTable.id, id))
      .limit(1);
    return (row as CollectionEntity | undefined) ?? null;
  },

  /** Returns null when the collection does not exist OR is not owned. */
  async getCollection(
    id: string,
    userId: string,
  ): Promise<CollectionEntity | null> {
    const [row] = await db
      .select()
      .from(CollectionTable)
      .where(
        and(eq(CollectionTable.id, id), eq(CollectionTable.userId, userId)),
      );
    return (row as CollectionEntity | undefined) ?? null;
  },

  /** Cascades to items -> documents -> chunks via FK ON DELETE CASCADE. */
  async deleteCollection(id: string, userId: string): Promise<boolean> {
    const deleted = await db
      .delete(CollectionTable)
      .where(
        and(
          eq(CollectionTable.id, id),
          eq(CollectionTable.userId, userId),
          // Shared collection deletion also requires the creator's current
          // writable membership; a stale route-level check cannot outlive it.
          sql`(
            ${CollectionTable.orgId} IS NULL
            OR EXISTS (
              SELECT 1 FROM team_member tm
              WHERE tm.team_id = ${CollectionTable.orgId}
                AND tm.user_id = ${userId}
                AND tm.role IN ('admin', 'member')
            )
            OR EXISTS (
              SELECT 1 FROM team t
              WHERE t.id = ${CollectionTable.orgId}
                AND t.owner_id = ${userId}
            )
          )`,
        ),
      )
      .returning({ id: CollectionTable.id });
    return deleted.length > 0;
  },

  // --- items -------------------------------------------------------------

  async createCollectionItem(
    input: CreateCollectionItemInput,
  ): Promise<CollectionItemEntity> {
    const values = {
      collectionId: input.collectionId,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl ?? null,
      storageKey: input.storageKey ?? null,
      filename: input.filename ?? null,
      mediaType: input.mediaType ?? null,
      status: input.status ?? "pending",
    };
    if (input.storageKey) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.storageKey}, 0))`,
        );
        const [existing] = await tx
          .select({ id: CollectionItemTable.id })
          .from(CollectionItemTable)
          .where(eq(CollectionItemTable.storageKey, input.storageKey!))
          .limit(1);
        if (existing)
          throw new Error(
            "Storage object is already attached to a collection item",
          );
        const [queued] = await tx
          .select({ id: FileCleanupOutboxTable.id })
          .from(FileCleanupOutboxTable)
          .where(eq(FileCleanupOutboxTable.storageKey, input.storageKey!))
          .limit(1);
        if (queued)
          throw new Error(
            "Storage object is pending deletion and cannot be reused",
          );
        const [row] = await tx
          .insert(CollectionItemTable)
          .values(values)
          .returning();
        return row as CollectionItemEntity;
      });
    }
    const [row] = await db
      .insert(CollectionItemTable)
      .values(values)
      .returning();
    return row as CollectionItemEntity;
  },

  async listCollectionItems(
    collectionId: string,
  ): Promise<CollectionItemEntity[]> {
    return (await db
      .select()
      .from(CollectionItemTable)
      .where(eq(CollectionItemTable.collectionId, collectionId))
      .orderBy(desc(CollectionItemTable.createdAt))) as CollectionItemEntity[];
  },

  /** Item metadata read with membership revalidated in the same SQL statement. */
  async listAccessibleCollectionItems(
    collectionId: string,
    userId: string,
  ): Promise<CollectionItemEntity[]> {
    const rows = await db
      .select({ item: CollectionItemTable })
      .from(CollectionItemTable)
      .innerJoin(
        CollectionTable,
        eq(CollectionTable.id, CollectionItemTable.collectionId),
      )
      .where(
        and(
          eq(CollectionTable.id, collectionId),
          sql`(
            (
              ${CollectionTable.orgId} IS NULL
              AND ${CollectionTable.userId} = ${userId}
            )
            OR (
              ${CollectionTable.orgId} IS NOT NULL
              AND (
                EXISTS (
                  SELECT 1 FROM team_member tm
                  WHERE tm.team_id = ${CollectionTable.orgId}
                    AND tm.user_id = ${userId}
                )
                OR EXISTS (
                  SELECT 1 FROM team t
                  WHERE t.id = ${CollectionTable.orgId}
                    AND t.owner_id = ${userId}
                )
              )
            )
          )`,
        ),
      )
      .orderBy(desc(CollectionItemTable.createdAt));
    return rows.map((row) => {
      const { storageKey: _storageKey, ...item } =
        row.item as CollectionItemEntity;
      return item as CollectionItemEntity;
    });
  },

  async updateItemStatus(
    itemId: string,
    status: CollectionItemStatus,
    error?: string | null,
    clearStorageKey = false,
  ): Promise<void> {
    await db
      .update(CollectionItemTable)
      .set({
        status,
        error: error ?? null,
        ...(clearStorageKey ? { storageKey: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(CollectionItemTable.id, itemId));
  },

  /**
   * Ownership check for a caller that only holds an item id. Joins back
   * up to `collection` because `collection_item` carries no user id.
   */
  async assertItemOwned(
    itemId: string,
    userId: string,
  ): Promise<CollectionItemEntity | null> {
    const [row] = await db
      .select({ item: CollectionItemTable })
      .from(CollectionItemTable)
      .innerJoin(
        CollectionTable,
        eq(CollectionTable.id, CollectionItemTable.collectionId),
      )
      .where(
        and(
          eq(CollectionItemTable.id, itemId),
          eq(CollectionTable.userId, userId),
        ),
      );
    return (row?.item as CollectionItemEntity | undefined) ?? null;
  },

  async deleteCollectionItem(
    itemId: string,
    collectionId: string,
    userId: string,
  ): Promise<
    | { status: "not-found" | "unsafe-key" | "shared-object" | "referenced" }
    | { status: "deleted" }
    | { status: "queued"; outboxId: string }
  > {
    const outcome = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ item: CollectionItemTable, collection: CollectionTable })
        .from(CollectionItemTable)
        .innerJoin(
          CollectionTable,
          eq(CollectionTable.id, CollectionItemTable.collectionId),
        )
        .where(
          and(
            eq(CollectionItemTable.id, itemId),
            eq(CollectionItemTable.collectionId, collectionId),
            eq(CollectionTable.userId, userId),
          ),
        )
        .for("update")
        .limit(1);
      if (!row || row.collection.orgId || row.item.sourceType !== "file")
        return "not-found" as const;
      const key = row.item.storageKey;
      if (key && !isUserStorageKey(key, userId)) return "unsafe-key" as const;
      if (key) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
        );
        const [duplicate] = await tx
          .select({ id: CollectionItemTable.id })
          .from(CollectionItemTable)
          .where(
            and(
              eq(CollectionItemTable.storageKey, key),
              sql`${CollectionItemTable.id} <> ${itemId}`,
            ),
          )
          .limit(1);
        if (duplicate) return "shared-object" as const;
      }

      const referenceChecks = await Promise.all([
        tx
          .select({ id: ProjectDocumentTable.projectId })
          .from(ProjectDocumentTable)
          .where(eq(ProjectDocumentTable.collectionItemId, itemId))
          .limit(1),
        tx
          .select({ id: TabularReviewItemTable.id })
          .from(TabularReviewItemTable)
          .where(eq(TabularReviewItemTable.itemId, itemId))
          .limit(1),
        tx
          .select({ id: TabularReviewCellTable.id })
          .from(TabularReviewCellTable)
          .where(eq(TabularReviewCellTable.itemId, itemId))
          .limit(1),
        tx
          .select({ id: ProjectBrainMcpSyncSourceTable.id })
          .from(ProjectBrainMcpSyncSourceTable)
          .where(eq(ProjectBrainMcpSyncSourceTable.sourceItemId, itemId))
          .limit(1),
        tx
          .select({ id: ProjectBrainMcpSyncRunTable.id })
          .from(ProjectBrainMcpSyncRunTable)
          .where(eq(ProjectBrainMcpSyncRunTable.sourceItemId, itemId))
          .limit(1),
        tx
          .select({ id: ProjectBrainComposioSyncSourceTable.id })
          .from(ProjectBrainComposioSyncSourceTable)
          .where(eq(ProjectBrainComposioSyncSourceTable.sourceItemId, itemId))
          .limit(1),
        tx
          .select({ id: ProjectBrainComposioSyncRunTable.id })
          .from(ProjectBrainComposioSyncRunTable)
          .where(eq(ProjectBrainComposioSyncRunTable.sourceItemId, itemId))
          .limit(1),
        tx
          .select({ id: ProjectBrainSourceVersionTable.id })
          .from(ProjectBrainSourceVersionTable)
          .where(eq(ProjectBrainSourceVersionTable.sourceItemId, itemId))
          .limit(1),
        tx
          .select({ id: ProjectBrainSourceStateTable.projectId })
          .from(ProjectBrainSourceStateTable)
          .where(eq(ProjectBrainSourceStateTable.sourceItemId, itemId))
          .limit(1),
        tx
          .select({ id: ProjectBrainRunTable.id })
          .from(ProjectBrainRunTable)
          .where(eq(ProjectBrainRunTable.sourceItemId, itemId))
          .limit(1),
        tx
          .select({ id: ProjectBrainFactTable.id })
          .from(ProjectBrainFactTable)
          .where(eq(ProjectBrainFactTable.sourceItemId, itemId))
          .limit(1),
        tx
          .select({ id: ProjectBrainTodoTable.id })
          .from(ProjectBrainTodoTable)
          .where(eq(ProjectBrainTodoTable.sourceItemId, itemId))
          .limit(1),
      ]);
      if (referenceChecks.some((rows) => rows.length))
        return "referenced" as const;

      if (key) {
        const [outbox] = await tx
          .insert(FileCleanupOutboxTable)
          .values({ userId, storageKey: key })
          .returning({ id: FileCleanupOutboxTable.id });
        if (!outbox)
          throw new Error("Failed to create durable file cleanup task");
        const deleted = await tx
          .delete(CollectionItemTable)
          .where(eq(CollectionItemTable.id, itemId))
          .returning({ id: CollectionItemTable.id });
        if (!deleted.length)
          throw new Error("Collection item disappeared during deletion");
        return { status: "queued", outboxId: outbox.id } as const;
      }
      const deleted = await tx
        .delete(CollectionItemTable)
        .where(eq(CollectionItemTable.id, itemId))
        .returning({ id: CollectionItemTable.id });
      return deleted.length ? ("deleted" as const) : ("not-found" as const);
    });
    if (typeof outcome === "string") return { status: outcome };
    return outcome;
  },

  // --- documents + chunks ------------------------------------------------

  async createDocument(
    collectionItemId: string,
    content: string,
  ): Promise<DocumentEntity> {
    const [row] = await db
      .insert(DocumentTable)
      .values({ collectionItemId, content })
      .returning();
    return row as DocumentEntity;
  },

  async listDocumentsForItem(itemId: string): Promise<DocumentEntity[]> {
    return (await db
      .select()
      .from(DocumentTable)
      .where(eq(DocumentTable.collectionItemId, itemId))
      .orderBy(asc(DocumentTable.createdAt))) as DocumentEntity[];
  },

  /**
   * Bulk-insert chunks for one document. The embedding is passed through
   * `formatEmbeddingForPg` (validates length/NaN) and cast to `vector`
   * so pgvector accepts it. Inserted in batches because a large document
   * can produce hundreds of chunks and Postgres caps bind parameters.
   */
  async insertDocumentChunks(
    documentId: string,
    chunks: InsertChunkInput[],
    batchSize = 100,
  ): Promise<number> {
    if (chunks.length === 0) return 0;
    let inserted = 0;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      await db.insert(DocumentChunkTable).values(
        batch.map((c) => ({
          documentId,
          content: c.content,
          position: c.position,
          embedding: sql`${formatEmbeddingForPg(c.embedding)}::vector` as never,
        })),
      );
      inserted += batch.length;
    }
    return inserted;
  },

  /** Chunk counts per item — used by the API to report ingest results. */
  async countChunksForItems(
    itemIds: string[],
  ): Promise<Record<string, number>> {
    if (itemIds.length === 0) return {};
    const rows = await db
      .select({
        itemId: DocumentTable.collectionItemId,
        count: sql<number>`count(${DocumentChunkTable.id})::int`,
      })
      .from(DocumentChunkTable)
      .innerJoin(
        DocumentTable,
        eq(DocumentTable.id, DocumentChunkTable.documentId),
      )
      .where(inArray(DocumentTable.collectionItemId, itemIds))
      .groupBy(DocumentTable.collectionItemId);
    return Object.fromEntries(rows.map((r) => [r.itemId, Number(r.count)]));
  },
};
