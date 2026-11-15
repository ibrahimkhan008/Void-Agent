import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listOwnedFiles: vi.fn(),
  listOwnedCollections: vi.fn(),
  listOwnedCollectionItems: vi.fn(),
  listCanvasExports: vi.fn(),
  listChatExports: vi.fn(),
  selectResults: [] as unknown[][],
  select: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth: (handler: (...args: any[]) => unknown) => (request?: Request) =>
    handler(request ?? new NextRequest("https://app.test/api/library"), {
      user: { id: "user-1" },
    }),
}));
vi.mock("@/lib/file-storage", () => ({
  serverFileStorage: { listOwnedFiles: mocks.listOwnedFiles },
}));
vi.mock("@/lib/file-storage/storage-utils", () => ({
  downloadFilenameFromKey: (key: string) => key.split("/").at(-1),
}));
vi.mock("@/lib/collections/collection-service", () => ({
  listOwnedCollections: mocks.listOwnedCollections,
  listOwnedCollectionItems: mocks.listOwnedCollectionItems,
}));
vi.mock("@/lib/db/pg/repositories/canvas-export-repository.pg", () => ({
  pgCanvasExportRepository: {
    selectSummaryByExporterId: mocks.listCanvasExports,
  },
}));
vi.mock("lib/db/repository", () => ({
  chatExportRepository: {
    selectSummaryByExporterId: mocks.listChatExports,
  },
}));
vi.mock("@/lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select },
}));

import { GET } from "./route";

describe("GET /api/library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectResults = [
      [{ id: "project-1", name: "Research" }],
      [],
      [
        {
          id: "doc-1",
          projectId: "project-1",
          storageKey: "agentset/doc-1",
          filename: "paper.pdf",
          contentType: "application/pdf",
          size: 500,
          createdAt: new Date("2026-11-15T00:00:00.000Z"),
          projectName: "Research",
        },
      ],
    ];
    mocks.select.mockImplementation(() => {
      const result = mocks.selectResults.shift() ?? [];
      const isDocumentQuery = mocks.select.mock.calls.length === 3;
      const query: Record<string, any> = {};
      query.from = vi.fn(() => query);
      query.innerJoin = vi.fn(() => query);
      query.where = vi.fn(() =>
        isDocumentQuery ? query : Promise.resolve(result),
      );
      query.orderBy = vi.fn(() => Promise.resolve(result));
      return query;
    });
    mocks.listOwnedFiles.mockResolvedValue({
      files: [
        {
          key: "uploads/user-1/chat.txt",
          filename: "chat.txt",
          contentType: "text/plain",
          size: 10,
          uploadedAt: new Date("2026-11-14T00:00:00.000Z"),
          bucket: "attachments",
        },
      ],
      incomplete: false,
    });
    mocks.listOwnedCollections.mockResolvedValue([
      { id: "collection-1", name: "Notes" },
    ]);
    mocks.listOwnedCollectionItems.mockResolvedValue({
      items: [
        {
          id: "item-1",
          sourceType: "file",
          filename: "source.docx",
          mediaType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          createdAt: "2026-11-13T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
    mocks.listCanvasExports.mockResolvedValue([
      {
        id: "canvas-1",
        title: "Canvas board",
        canvasId: "canvas-source-1",
        createdAt: new Date("2026-11-12T00:00:00.000Z"),
        revokedAt: null,
      },
    ]);
    mocks.listChatExports.mockResolvedValue([
      {
        id: "shared-1",
        title: "Shared research chat",
        originalThreadId: "thread-1",
        exportedAt: new Date("2026-11-11T00:00:00.000Z"),
        hasActiveShare: true,
        legacyShareEnabled: false,
      },
    ]);
  });

  it("combines the caller's storage, project, and knowledge collection uploads", async () => {
    const response = await GET(new NextRequest("https://app.test/api/library"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.files.map((file: { name: string }) => file.name)).toEqual([
      "paper.pdf",
      "chat.txt",
      "source.docx",
      "Canvas board",
      "Shared research chat",
    ]);
    expect(body.files[1].href).toContain("bucket=attachments");
    expect(body.files[0].href).toContain(
      "/api/projects/project-1/documents/doc-1/download",
    );
    expect(body.files[2].href).toBe("/knowledge/collection-1");
    expect(body.files[3].href).toBe("/ecanvas/export/canvas-1");
    expect(body.files[4].href).toBe("/chat/thread-1");
    expect(mocks.listOwnedFiles).toHaveBeenCalledWith("user-1");
    expect(mocks.listOwnedCollections).toHaveBeenCalledWith("user-1");
    expect(mocks.listOwnedCollectionItems).toHaveBeenCalledWith({
      id: "collection-1",
      userId: "user-1",
      cursor: undefined,
    });
  });

  it("still returns database-backed files when object storage is unavailable", async () => {
    mocks.listOwnedFiles.mockRejectedValueOnce(new Error("storage offline"));
    const response = await GET(new NextRequest("https://app.test/api/library"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.files.map((file: { name: string }) => file.name)).toEqual([
      "paper.pdf",
      "source.docx",
      "Canvas board",
      "Shared research chat",
    ]);
    expect(body.truncated).toBe(true);
  });
});
