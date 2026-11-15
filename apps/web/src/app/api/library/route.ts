import {
  listOwnedCollectionItems,
  listOwnedCollections,
} from "@/lib/collections/collection-service";
import { pgDb } from "@/lib/db/pg/db.pg";
import { pgCanvasExportRepository } from "@/lib/db/pg/repositories/canvas-export-repository.pg";
import {
  DocumentTable,
  ProjectMemberTable,
  ProjectTable,
} from "@/lib/db/pg/schema.pg";
import { serverFileStorage } from "@/lib/file-storage";
import { downloadFilenameFromKey } from "@/lib/file-storage/storage-utils";
import { withAuth } from "auth/route-guard";
import { and, desc, eq, inArray } from "drizzle-orm";
import { chatExportRepository } from "lib/db/repository";
import { NextResponse } from "next/server";

type LibraryFile = {
  id: string;
  name: string;
  contentType: string | null;
  size: number | null;
  createdAt: string | null;
  category: string;
  location: string;
  href: string;
  source: "storage" | "project" | "collection" | "canvas" | "shared-chat";
  visibility: string;
  previewUrl?: string;
};

export const GET = withAuth(async (_request, session) => {
  const userId = session.user.id;
  try {
    const [
      storageListing,
      collections,
      ownedProjects,
      memberships,
      canvasExports,
      chatExports,
    ] = await Promise.all([
      serverFileStorage.listOwnedFiles(userId).catch((error) => {
        console.error("Failed to list object storage files", error);
        return { files: [], incomplete: true };
      }),
      listOwnedCollections(userId),
      pgDb
        .select({ id: ProjectTable.id, name: ProjectTable.name })
        .from(ProjectTable)
        .where(eq(ProjectTable.ownerUserId, userId)),
      pgDb
        .select({ id: ProjectMemberTable.projectId })
        .from(ProjectMemberTable)
        .where(eq(ProjectMemberTable.userId, userId)),
      pgCanvasExportRepository.selectSummaryByExporterId(userId),
      chatExportRepository.selectSummaryByExporterId(userId),
    ]);

    const accessibleProjectIds = new Set([
      ...ownedProjects.map((project) => project.id),
      ...memberships.map((membership) => membership.id),
    ]);
    const projectIds = [...accessibleProjectIds];
    const projectDocuments = projectIds.length
      ? await pgDb
          .select({
            id: DocumentTable.id,
            projectId: DocumentTable.projectId,
            storageKey: DocumentTable.storageKey,
            filename: DocumentTable.filename,
            contentType: DocumentTable.contentType,
            size: DocumentTable.size,
            createdAt: DocumentTable.createdAt,
            projectName: ProjectTable.name,
            sourceProvider: DocumentTable.sourceProvider,
          })
          .from(DocumentTable)
          .innerJoin(ProjectTable, eq(DocumentTable.projectId, ProjectTable.id))
          .where(
            and(
              eq(DocumentTable.userId, userId),
              inArray(DocumentTable.projectId, projectIds),
            ),
          )
          .orderBy(desc(DocumentTable.createdAt))
      : [];

    const filesByKey = new Map<string, LibraryFile>();
    for (const file of storageListing.files) {
      filesByKey.set(file.key, {
        id: `${file.bucket}:${file.key}`,
        name: downloadFilenameFromKey(file.key),
        contentType: file.contentType,
        size: file.size,
        createdAt: file.uploadedAt?.toISOString() ?? null,
        category:
          file.bucket === "avatars"
            ? "File"
            : file.bucket === "ai-generated"
              ? "Artifact"
              : "File",
        location: "Your files",
        href: `/api/storage/download?key=${encodeURIComponent(file.key)}&bucket=${file.bucket}`,
        source: "storage",
        visibility: file.bucket === "avatars" ? "Public profile" : "Private",
        previewUrl: file.contentType.startsWith("image/")
          ? `/api/storage/download?key=${encodeURIComponent(file.key)}&bucket=${file.bucket}&disposition=inline`
          : undefined,
      });
    }

    for (const document of projectDocuments) {
      filesByKey.set(document.storageKey, {
        id: `project:${document.id}`,
        name: document.filename,
        contentType: document.contentType,
        size: document.size,
        createdAt: document.createdAt.toISOString(),
        category: "File",
        location: document.projectName,
        href: `/api/projects/${encodeURIComponent(document.projectId)}/documents/${encodeURIComponent(document.id)}/download`,
        source: "project",
        visibility: "Project members",
        previewUrl:
          document.sourceProvider === "supabase" &&
          document.contentType.startsWith("image/")
            ? `/api/storage/download?key=${encodeURIComponent(document.storageKey)}&bucket=attachments&disposition=inline`
            : undefined,
      });
    }

    const collectionItems: LibraryFile[] = [];
    let truncated =
      storageListing.files.length >= 2000 || storageListing.incomplete;
    for (let index = 0; index < collections.length; index += 4) {
      const group = collections.slice(index, index + 4);
      const results = await Promise.all(
        group.map(async (collection) => {
          try {
            const items: Array<{
              id: string;
              sourceType: string;
              filename: string | null;
              mediaType: string | null;
              createdAt: string;
            }> = [];
            let cursor: string | undefined;
            let pagesRead = 0;
            do {
              const page = await listOwnedCollectionItems({
                id: collection.id,
                userId,
                cursor,
              });
              if (!page) break;
              items.push(...page.items);
              cursor = page.nextCursor ?? undefined;
              pagesRead += 1;
            } while (cursor && pagesRead < 10);
            return {
              items: items
                .filter((item) => item.sourceType === "file")
                .map((item) => ({
                  id: `collection:${collection.id}:${item.id}`,
                  name: item.filename || "Uploaded document",
                  contentType: item.mediaType,
                  size: null,
                  createdAt: item.createdAt,
                  category: "File",
                  location: collection.name,
                  href: `/knowledge/${encodeURIComponent(collection.id)}`,
                  source: "collection" as const,
                  visibility: "Private collection",
                })),
              truncated: Boolean(cursor),
            };
          } catch (error) {
            console.error("Failed to list a user's knowledge files", error);
            return { items: [] as LibraryFile[], truncated: true };
          }
        }),
      );
      for (const result of results) {
        collectionItems.push(...result.items);
        truncated ||= result.truncated;
      }
    }

    const canvasFiles: LibraryFile[] = canvasExports
      .filter((canvas) => !canvas.revokedAt)
      .map((canvas) => ({
        id: `canvas:${canvas.id}`,
        name: canvas.title,
        contentType: "text/html",
        size: null,
        createdAt: canvas.createdAt.toISOString(),
        category: "Canvas",
        location: "Shared canvas",
        href: `/ecanvas/export/${encodeURIComponent(canvas.id)}`,
        source: "canvas",
        visibility: "Shared via link",
      }));
    const sharedChats: LibraryFile[] = chatExports
      .filter((chat) => chat.hasActiveShare || chat.legacyShareEnabled)
      .filter((chat) => !chat.expiresAt || chat.expiresAt > new Date())
      .map((chat) => ({
        id: `shared-chat:${chat.id}`,
        name: chat.title,
        contentType: "application/x-voidagent-shared-chat",
        size: null,
        createdAt: chat.exportedAt.toISOString(),
        category: "Shared chat",
        location: "Shared conversation",
        href: chat.originalThreadId
          ? `/chat/${encodeURIComponent(chat.originalThreadId)}`
          : `/export/${encodeURIComponent(chat.id)}`,
        source: "shared-chat",
        visibility: "Shared via link",
      }));

    const files = [
      ...filesByKey.values(),
      ...collectionItems,
      ...canvasFiles,
      ...sharedChats,
    ].sort((left, right) => {
      const leftTime =
        typeof left.createdAt === "string" ? Date.parse(left.createdAt) : 0;
      const rightTime =
        typeof right.createdAt === "string" ? Date.parse(right.createdAt) : 0;
      return rightTime - leftTime;
    });

    return NextResponse.json({ files, truncated });
  } catch (error) {
    console.error("Failed to load the user's file library", error);
    return NextResponse.json(
      { error: "Failed to load your files" },
      { status: 500 },
    );
  }
});
