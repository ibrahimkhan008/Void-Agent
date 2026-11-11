import "server-only";

import { getAgentsetNamespace } from "@/lib/agentset/client";
import { deleteAgentsetNamespace } from "@/lib/agentset/deletion";
import { deleteAgentsetDocument } from "@/lib/agentset/deletion";
import { mapAgentsetPipelineStatus } from "@/lib/agentset/ingest-job-status";
import {
  ensureKnowledgeBaseNamespace,
  ingestKnowledgeBaseFile,
} from "@/lib/agentset/knowledge-bases";
import { pgDb } from "@/lib/db/pg/db.pg";
import { KnowledgeBaseTable } from "@/lib/db/pg/schema.pg";
import { and, desc, eq } from "drizzle-orm";

export type CollectionEntity = typeof KnowledgeBaseTable.$inferSelect;

/** Preserve the former collections API shape while using upstream knowledge bases. */
export function toCollectionShape(collection: CollectionEntity) {
  return {
    id: collection.id,
    userId: collection.userId,
    orgId: null,
    name: collection.name,
    description: collection.description,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

export async function listOwnedCollections(userId: string) {
  return pgDb
    .select()
    .from(KnowledgeBaseTable)
    .where(eq(KnowledgeBaseTable.userId, userId))
    .orderBy(desc(KnowledgeBaseTable.createdAt));
}

/** Same null result for absent and foreign-owned IDs prevents ID probing. */
export async function getOwnedCollection(id: string, userId: string) {
  const [row] = await pgDb
    .select()
    .from(KnowledgeBaseTable)
    .where(
      and(eq(KnowledgeBaseTable.id, id), eq(KnowledgeBaseTable.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

export async function createOwnedCollection(input: {
  name: string;
  description?: string | null;
  userId: string;
}) {
  const [row] = await pgDb
    .insert(KnowledgeBaseTable)
    .values({
      name: input.name,
      description: input.description ?? null,
      userId: input.userId,
      // Collections retain the source product's owner-only visibility even
      // when the user currently has a shared organization selected.
      organizationId: null,
      visibility: "private",
    })
    .returning();
  if (!row) throw new Error("Collection could not be created");
  return row;
}

export async function deleteOwnedCollection(id: string, userId: string) {
  const collection = await getOwnedCollection(id, userId);
  if (!collection) return false;

  // Keep the row if the external delete fails, so callers can retry without
  // losing the namespace identifier and uploaded data.
  if (collection.agentsetNamespaceId) {
    await deleteAgentsetNamespace({
      namespaceId: collection.agentsetNamespaceId,
    });
  }

  const deleted = await pgDb
    .delete(KnowledgeBaseTable)
    .where(
      and(eq(KnowledgeBaseTable.id, id), eq(KnowledgeBaseTable.userId, userId)),
    )
    .returning({ id: KnowledgeBaseTable.id });
  return deleted.length > 0;
}

/** Lists only a caller-owned collection's AgentSet documents. */
export async function listOwnedCollectionItems(input: {
  id: string;
  userId: string;
  cursor?: string;
}) {
  const collection = await getOwnedCollection(input.id, input.userId);
  if (!collection) return null;
  if (!collection.agentsetNamespaceId) {
    return { items: [], nextCursor: null };
  }

  const page = await getAgentsetNamespace(
    collection.agentsetNamespaceId,
  ).documents.all({
    perPage: 100,
    orderBy: "createdAt",
    order: "desc",
    ...(input.cursor ? { cursor: input.cursor } : {}),
  });

  return {
    items: page.documents.map((document) => {
      const metadata = document.config?.metadata ?? {};
      const metadataSourceType = metadata.sourceType;
      const sourceType =
        metadataSourceType === "source-url" ? "source-url" : "file";
      const pipelineStatus = mapAgentsetPipelineStatus(document.status);
      const status =
        pipelineStatus === "completed"
          ? "ready"
          : pipelineStatus === "failed"
            ? "failed"
            : pipelineStatus === "processing"
              ? "chunking"
              : "pending";
      return {
        id: document.id,
        collectionId: input.id,
        sourceType,
        // The ingest path stores only a safe origin for remote URLs. Never
        // expose signed source URLs or managed-storage keys in this API.
        sourceUrl:
          typeof metadata.sourceOrigin === "string"
            ? metadata.sourceOrigin
            : null,
        filename: document.name,
        mediaType: document.properties?.mimeType ?? null,
        status,
        error: document.error,
        chunkCount: document.totalChunks,
        createdAt: document.createdAt,
        updatedAt:
          document.completedAt ??
          document.failedAt ??
          document.processingAt ??
          document.queuedAt ??
          document.createdAt,
      };
    }),
    nextCursor: page.pagination.nextCursor,
  };
}

/** Delete one item only after resolving it inside the owner's namespace. */
export async function deleteOwnedCollectionItem(input: {
  id: string;
  itemId: string;
  userId: string;
}) {
  const collection = await getOwnedCollection(input.id, input.userId);
  if (!collection?.agentsetNamespaceId) return false;

  const namespace = getAgentsetNamespace(collection.agentsetNamespaceId);
  try {
    await namespace.documents.get(input.itemId);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      ("status" in error ? error.status === 404 : false)
    ) {
      return false;
    }
    throw error;
  }

  await deleteAgentsetDocument({
    namespaceId: collection.agentsetNamespaceId,
    agentsetDocumentId: input.itemId,
  });
  return true;
}

/** Create a text ingestion job after the API has checked ownership and bounds. */
export async function ingestOwnedCollectionText(input: {
  id: string;
  userId: string;
  text: string;
  filename: string;
  sourceOrigin?: string;
}) {
  const collection = await getOwnedCollection(input.id, input.userId);
  if (!collection) return null;
  const namespace = collection.agentsetNamespaceId
    ? getAgentsetNamespace(collection.agentsetNamespaceId)
    : await ensureKnowledgeBaseNamespace(collection.id);
  const job = await namespace.ingestion.create({
    name: input.filename,
    payload: {
      type: "TEXT",
      text: input.text,
      fileName: input.filename,
    },
    config: {
      metadata: {
        knowledgeBaseId: collection.id,
        userId: input.userId,
        filename: input.filename,
        sourceType: input.sourceOrigin ? "source-url" : "file",
        ...(input.sourceOrigin ? { sourceOrigin: input.sourceOrigin } : {}),
      },
    },
  });
  return { jobId: job.id, status: job.status, filename: input.filename };
}

/** Upload a bounded, already-validated file into the owner's private namespace. */
export async function ingestOwnedCollectionFile(input: {
  id: string;
  userId: string;
  file: File;
  filename: string;
  contentType: string;
}) {
  const collection = await getOwnedCollection(input.id, input.userId);
  if (!collection) return null;
  const { job } = await ingestKnowledgeBaseFile({
    knowledgeBaseId: collection.id,
    userId: input.userId,
    file: input.file,
    filename: input.filename,
    contentType: input.contentType,
  });
  return { jobId: job.id, status: job.status, filename: input.filename };
}
