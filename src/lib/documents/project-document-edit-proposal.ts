import "server-only";

import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  projectDocumentEditProposalsSchema,
  projectDocumentEditRepository,
} from "lib/db/pg/repositories/project-document-edit-repository.pg";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CollectionItemTable,
  CollectionTable,
  ProjectDocumentTable,
} from "lib/db/pg/schema.pg";
import {
  MAX_TRACKED_DOCX_EDITS,
  MAX_TRACKED_DOCX_INPUT_BYTES,
  MAX_TRACKED_DOCX_OUTPUT_BYTES,
  TRACKED_DOCX_CONTENT_TYPE,
  TrackedDocxError,
  applyTrackedEdits,
} from "lib/documents/project-tracked-docx";
import { serverFileStorage, storageDriver } from "lib/file-storage";
import {
  getProjectAccess,
  getProjectCollectionSourceOwnerIds,
  mayEditProject,
} from "lib/projects/access";

type Proposal = {
  originalText: string;
  suggestedText: string;
  rationale: string;
};

function privateStorageAvailable() {
  if (storageDriver === "local") return true;
  if (storageDriver === "vercel-blob")
    return process.env.VERCEL_BLOB_ACCESS?.trim().toLowerCase() === "private";
  return /^(1|true)$/i.test(process.env.FILE_STORAGE_S3_PRIVATE ?? "");
}

/**
 * Reauthorize, create a source-revision-bound candidate, and persist it as
 * pending. This intentionally cannot resolve a proposal or replace a source.
 */
export async function createPendingProjectDocumentEdit(args: {
  userId: string;
  projectId: string;
  documentId: string;
  collectionIds: string[];
  filename: string;
  proposals: Proposal[];
}) {
  const parsedProposals = projectDocumentEditProposalsSchema.safeParse(
    args.proposals,
  );
  if (
    !parsedProposals.success ||
    parsedProposals.data.length < 1 ||
    parsedProposals.data.length > Math.min(20, MAX_TRACKED_DOCX_EDITS)
  )
    throw new TrackedDocxError("Provide between 1 and 20 precise edits.");
  const proposals = parsedProposals.data;

  const access = await getProjectAccess(args.projectId, args.userId);
  if (!access || !mayEditProject(access.role))
    throw new Error("You do not have permission to propose edits here.");
  const collectionIds = args.collectionIds.filter((id) =>
    access.project.collectionIds.includes(id),
  );
  if (!collectionIds.length)
    throw new Error("This document is no longer in the current project scope.");
  const ownerIds = await getProjectCollectionSourceOwnerIds(access);
  if (!ownerIds.length)
    throw new Error("This document is no longer in the current project scope.");

  const [source] = await pgDb
    .select({
      projectDocumentId: ProjectDocumentTable.id,
      filename: CollectionItemTable.filename,
      storageKey: CollectionItemTable.storageKey,
    })
    .from(ProjectDocumentTable)
    .innerJoin(
      CollectionItemTable,
      eq(CollectionItemTable.id, ProjectDocumentTable.collectionItemId),
    )
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .where(
      and(
        eq(ProjectDocumentTable.projectId, args.projectId),
        eq(ProjectDocumentTable.collectionItemId, args.documentId),
        inArray(CollectionItemTable.collectionId, collectionIds),
        inArray(CollectionTable.userId, ownerIds),
        eq(CollectionItemTable.status, "ready"),
      ),
    )
    .limit(1);

  if (
    !source?.projectDocumentId ||
    !source.filename?.toLowerCase().endsWith(".docx") ||
    source.filename !== args.filename ||
    !source.storageKey
  )
    throw new Error("This DOCX is no longer available in project context.");
  if (!privateStorageAvailable())
    throw new Error("Private file storage is required for tracked edits.");

  const original = await serverFileStorage.downloadLimited(
    source.storageKey,
    MAX_TRACKED_DOCX_INPUT_BYTES,
  );
  const sourceRevisionHash = createHash("sha256")
    .update(original)
    .digest("hex");
  const applied = await applyTrackedEdits(original, proposals, {
    author: "Void-Agent",
  });
  if (applied.errors.length || applied.changes.length !== proposals.length)
    throw new TrackedDocxError(
      "One or more proposed edits could not be matched exactly and uniquely in the current DOCX. No review copy was created.",
    );
  if (!applied.changes.length)
    throw new TrackedDocxError("No safe changes could be prepared.");
  if (applied.bytes.byteLength > MAX_TRACKED_DOCX_OUTPUT_BYTES)
    throw new TrackedDocxError(
      "The tracked edit output exceeds the file limit.",
    );

  // Recheck both current project permission and source revision immediately
  // before persisting the candidate, since the model turn may take time.
  const currentAccess = await getProjectAccess(args.projectId, args.userId);
  if (!currentAccess || !mayEditProject(currentAccess.role))
    throw new Error(
      "Project edit permission changed; no proposal was created.",
    );
  const currentOwners = await getProjectCollectionSourceOwnerIds(currentAccess);
  const currentCollectionIds = args.collectionIds.filter((id) =>
    currentAccess.project.collectionIds.includes(id),
  );
  if (!currentOwners.length || !currentCollectionIds.length)
    throw new Error(
      "Project document access changed; no proposal was created.",
    );
  const [currentSource] = await pgDb
    .select({
      projectDocumentId: ProjectDocumentTable.id,
      filename: CollectionItemTable.filename,
      storageKey: CollectionItemTable.storageKey,
    })
    .from(ProjectDocumentTable)
    .innerJoin(
      CollectionItemTable,
      eq(CollectionItemTable.id, ProjectDocumentTable.collectionItemId),
    )
    .innerJoin(
      CollectionTable,
      eq(CollectionTable.id, CollectionItemTable.collectionId),
    )
    .where(
      and(
        eq(ProjectDocumentTable.projectId, args.projectId),
        eq(ProjectDocumentTable.collectionItemId, args.documentId),
        inArray(CollectionItemTable.collectionId, currentCollectionIds),
        inArray(CollectionTable.userId, currentOwners),
        eq(CollectionItemTable.status, "ready"),
      ),
    )
    .limit(1);
  if (
    !currentSource?.storageKey ||
    currentSource.projectDocumentId !== source.projectDocumentId ||
    currentSource.filename !== source.filename
  )
    throw new Error(
      "Project document access changed; no proposal was created.",
    );
  const currentBytes = await serverFileStorage.downloadLimited(
    currentSource.storageKey,
    MAX_TRACKED_DOCX_INPUT_BYTES,
  );
  if (
    createHash("sha256").update(currentBytes).digest("hex") !==
    sourceRevisionHash
  )
    throw new Error("The source document changed; no proposal was created.");

  const upload = await serverFileStorage.upload(applied.bytes, {
    filename: `${source.filename.replace(/\.docx$/i, "")}_tracked.docx`,
    contentType: TRACKED_DOCX_CONTENT_TYPE,
    ownerId: args.userId,
  });
  try {
    const edit = await projectDocumentEditRepository.createPending({
      projectId: args.projectId,
      projectDocumentId: source.projectDocumentId,
      createdByUserId: args.userId,
      sourceRevisionHash,
      candidateStorageKey: upload.key,
      proposedEdits: proposals,
      trackedChanges: applied.changes.map(({ id, delId, insId }) => ({
        id,
        delId,
        insId,
      })),
    });
    return {
      editId: edit.id,
      changes: proposals,
      sourceRevisionHash,
    };
  } catch (error) {
    await serverFileStorage.delete(upload.key).catch(() => undefined);
    throw error;
  }
}
