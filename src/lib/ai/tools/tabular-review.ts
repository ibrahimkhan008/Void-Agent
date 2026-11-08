import "server-only";

import { tool } from "ai";
import { and, desc, eq, inArray } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  DocumentTable,
  TabularReviewCellTable,
  TabularReviewItemTable,
  TabularReviewSourceDocumentTable,
  TabularReviewTable,
} from "lib/db/pg/schema.pg";
import { getProjectAccess } from "lib/projects/access";
import { normalizeReviewColumn } from "lib/tabular/review-presets";
import { createReviewSchema } from "lib/tabular/review-schema";
import { groupReviewSourceDocuments } from "lib/tabular/review-source";

export type AvailableReviewSource = {
  itemId: string;
  filename: string | null;
  collectionName: string;
};

async function resolveAllowedCollections(
  userId: string,
  projectId?: string | null,
  threadCollectionIds?: string[] | null,
) {
  if (projectId) {
    const access = await getProjectAccess(projectId, userId);
    if (!access) return { collectionIds: [], ownerIds: [] };
    const scoped = threadCollectionIds ?? access.project.collectionIds;
    if (scoped.some((id) => !access.project.collectionIds.includes(id))) {
      return { collectionIds: [], ownerIds: [] };
    }
    return {
      collectionIds: scoped,
      // Reviews are creator-private and their generation route revalidates
      // creator-owned sources. Keep tool suggestions within that same boundary.
      ownerIds: [userId],
    };
  }
  if (threadCollectionIds !== null && threadCollectionIds !== undefined) {
    if (threadCollectionIds.length === 0)
      return { collectionIds: [], ownerIds: [] };
    const owned = await pgDb
      .select({ id: CollectionTable.id })
      .from(CollectionTable)
      .where(
        and(
          inArray(CollectionTable.id, threadCollectionIds),
          eq(CollectionTable.userId, userId),
        ),
      );
    return {
      collectionIds: owned.map((row) => row.id),
      ownerIds: [userId],
    };
  }
  const owned = await pgDb
    .select({ id: CollectionTable.id })
    .from(CollectionTable)
    .where(eq(CollectionTable.userId, userId));
  return { collectionIds: owned.map((row) => row.id), ownerIds: [userId] };
}

export async function listAvailableReviewSources(args: {
  userId: string;
  projectId?: string | null;
  threadCollectionIds?: string[] | null;
}): Promise<AvailableReviewSource[]> {
  const scope = await resolveAllowedCollections(
    args.userId,
    args.projectId,
    args.threadCollectionIds,
  );
  if (!scope.collectionIds.length || !scope.ownerIds.length) return [];
  return pgDb
    .selectDistinct({
      itemId: CollectionItemTable.id,
      filename: CollectionItemTable.filename,
      collectionName: CollectionTable.name,
      updatedAt: CollectionItemTable.updatedAt,
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
        inArray(CollectionItemTable.collectionId, scope.collectionIds),
        inArray(CollectionTable.userId, scope.ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    )
    .orderBy(desc(CollectionItemTable.updatedAt))
    .limit(30)
    .then((rows) =>
      rows.map(({ itemId, filename, collectionName }) => ({
        itemId,
        filename,
        collectionName,
      })),
    );
}

export function buildAvailableReviewSourcesPrompt(
  sources: AvailableReviewSource[],
) {
  if (!sources.length) return "";
  const lines = sources.map(
    (source) =>
      `- ${source.filename || "Untitled"} (collection: ${source.collectionName}; item ID: ${source.itemId})`,
  );
  return [
    "## Available documents for tabular review",
    "These are ready documents the current user can access. If asked to compare or extract the same fields from multiple documents, use createTabularReview and pass the exact item IDs. Do not invent IDs or include sources outside this list.",
    ...lines,
  ].join("\n");
}

export function createTabularReviewTool(args: {
  userId: string;
  projectId?: string | null;
  threadCollectionIds?: string[] | null;
  allowedSources: AvailableReviewSource[];
}) {
  const sourceIds = new Set(args.allowedSources.map((source) => source.itemId));
  return tool({
    description:
      "Create a tabular review that extracts the same fields from several available Knowledge documents. Each source is a row and each field is a column. Use this for document comparison or structured multi-file review. The user can inspect the generated table and export it to Excel.",
    inputSchema: createReviewSchema,
    execute: async ({ title, itemIds, columns }, options) => {
      // Stopping the chat turn should not leave a review being created for a
      // request the caller has already abandoned.
      options?.abortSignal?.throwIfAborted();
      if (itemIds.some((itemId) => !sourceIds.has(itemId))) {
        return {
          error:
            "A selected source is not in the available document list. Refresh the conversation and try again.",
        };
      }
      const scope = await resolveAllowedCollections(
        args.userId,
        args.projectId,
        args.threadCollectionIds,
      );
      const rows = await pgDb
        .selectDistinct({ itemId: CollectionItemTable.id })
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
            inArray(CollectionItemTable.id, itemIds),
            inArray(CollectionItemTable.collectionId, scope.collectionIds),
            inArray(CollectionTable.userId, scope.ownerIds),
            eq(CollectionItemTable.status, "ready"),
          ),
        );
      options?.abortSignal?.throwIfAborted();
      if (rows.length !== itemIds.length)
        return { error: "One or more sources are no longer available." };

      const availableDocuments = await pgDb
        .select({
          itemId: DocumentTable.collectionItemId,
          documentId: DocumentTable.id,
          createdAt: DocumentTable.createdAt,
        })
        .from(DocumentTable)
        .innerJoin(
          CollectionItemTable,
          eq(CollectionItemTable.id, DocumentTable.collectionItemId),
        )
        .innerJoin(
          CollectionTable,
          eq(CollectionTable.id, CollectionItemTable.collectionId),
        )
        .where(
          and(
            inArray(CollectionItemTable.id, itemIds),
            inArray(CollectionItemTable.collectionId, scope.collectionIds),
            inArray(CollectionTable.userId, scope.ownerIds),
            eq(CollectionItemTable.status, "ready"),
          ),
        );
      const documentsByItem = groupReviewSourceDocuments(availableDocuments);
      if (itemIds.some((itemId) => !documentsByItem.has(itemId))) {
        return { error: "One or more sources have no extracted text." };
      }

      const persistedColumns = columns.map(normalizeReviewColumn);
      const review = await pgDb.transaction(async (tx) => {
        options?.abortSignal?.throwIfAborted();
        const [created] = await tx
          .insert(TabularReviewTable)
          .values({
            userId: args.userId,
            title,
            columns: persistedColumns,
          })
          .returning();
        options?.abortSignal?.throwIfAborted();
        await tx.insert(TabularReviewItemTable).values(
          itemIds.map((itemId, rowIndex) => ({
            reviewId: created.id,
            itemId,
            rowIndex,
          })),
        );
        options?.abortSignal?.throwIfAborted();
        await tx.insert(TabularReviewSourceDocumentTable).values(
          itemIds.flatMap((itemId) =>
            (documentsByItem.get(itemId) ?? []).map((document, position) => ({
              reviewId: created.id,
              itemId,
              documentId: document.documentId,
              position,
            })),
          ),
        );
        options?.abortSignal?.throwIfAborted();
        await tx.insert(TabularReviewCellTable).values(
          itemIds.flatMap((itemId) =>
            persistedColumns.map((column) => ({
              reviewId: created.id,
              itemId,
              columnId: column.id,
            })),
          ),
        );
        options?.abortSignal?.throwIfAborted();
        return created;
      });
      return {
        id: review.id,
        title: review.title,
        documentCount: itemIds.length,
        columnCount: columns.length,
      };
    },
  });
}
