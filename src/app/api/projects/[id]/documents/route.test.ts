import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  getCollectionAccess: vi.fn(),
  canWriteCollection: vi.fn(),
  canAttachCollectionToProject: vi.fn(),
  hasSameOrigin: vi.fn(),
  checkApiRateLimit: vi.fn(),
  upload: vi.fn(),
  deleteFile: vi.fn(),
  storageDriver: "local" as "local" | "s3" | "vercel-blob",
  ingestText: vi.fn(),
  enqueueProjectBrainForIngest: vi.fn(),
  parseDocument: vi.fn(),
  isParseableDocument: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  predicates: [] as unknown[],
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/collections/access", () => ({
  getCollectionAccess: mocks.getCollectionAccess,
  canWriteCollection: mocks.canWriteCollection,
  canAttachCollectionToProject: mocks.canAttachCollectionToProject,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { upload: mocks.upload, delete: mocks.deleteFile },
  get storageDriver() {
    return mocks.storageDriver;
  },
}));
vi.mock("lib/rag/ingest", () => ({
  ingestText: mocks.ingestText,
  IngestError: class IngestError extends Error {
    collectionItemId: string;
    constructor(message: string, collectionItemId: string) {
      super(message);
      this.collectionItemId = collectionItemId;
    }
  },
}));
vi.mock("lib/rag/parse", () => ({
  parseDocument: mocks.parseDocument,
  isParseableDocument: mocks.isParseableDocument,
}));
vi.mock("lib/projects/brain-queue", () => ({
  enqueueProjectBrainForIngest: mocks.enqueueProjectBrainForIngest,
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, insert: mocks.insert, delete: mocks.delete },
}));

import { IngestError } from "lib/rag/ingest";
import { GET, POST } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const collectionId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";
const params = { params: Promise.resolve({ id: projectId }) };
const access = {
  project: { id: projectId, teamId: null, collectionIds: [collectionId] },
  role: "owner",
};

function builder(rows: unknown[]) {
  const value: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "orderBy"]) {
    value[method] = vi.fn(() => value);
  }
  value.where = vi.fn((predicate: unknown) => {
    mocks.predicates.push(predicate);
    return value;
  });
  value.limit = vi.fn(async () => rows);
  return value;
}

function uploadRequest(fileName = "notes.txt", collection = collectionId) {
  const form = new FormData();
  form.set("collectionId", collection);
  const fileType = fileName.endsWith(".xlsx")
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : fileName.endsWith(".pptx")
      ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      : "text/plain";
  form.set("file", new File(["hello project"], fileName, { type: fileType }));
  return new Request(`http://localhost/api/projects/${projectId}/documents`, {
    method: "POST",
    headers: { Origin: "http://localhost" },
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.predicates.length = 0;
  mocks.getSession.mockResolvedValue({ user: { id: userId } });
  mocks.getProjectAccess.mockResolvedValue(access);
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue([userId]);
  mocks.getCollectionAccess.mockResolvedValue({
    collection: { id: collectionId, userId, orgId: null },
    role: "owner",
  });
  mocks.canWriteCollection.mockReturnValue(true);
  mocks.canAttachCollectionToProject.mockReturnValue(true);
  mocks.hasSameOrigin.mockReturnValue(true);
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.storageDriver = "local";
  mocks.isParseableDocument.mockReturnValue(true);
  mocks.parseDocument.mockResolvedValue({
    text: "hello project",
    kind: "text",
  });
  mocks.upload.mockResolvedValue({ key: "uploads/user/file.txt" });
  mocks.deleteFile.mockResolvedValue(undefined);
  mocks.ingestText.mockResolvedValue({
    itemId: "item-id",
    documentId: "doc-id",
    chunks: 1,
  });
  mocks.enqueueProjectBrainForIngest.mockResolvedValue({
    queued: 1,
    capped: false,
  });
  mocks.insert.mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
  mocks.delete.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
});

describe("project document API", () => {
  it("lists only scoped document metadata and never exposes storage keys", async () => {
    mocks.select.mockReturnValue(
      builder([
        {
          id: "item-id",
          collectionId,
          filename: "notes.txt",
          mediaType: "text/plain",
          status: "ready",
          createdAt: new Date(),
        },
      ]),
    );
    const response = await GET(new Request("http://localhost"), params);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.documents[0].id).toBe("item-id");
    expect(body.writableCollectionIds).toEqual([collectionId]);
    expect(JSON.stringify(body)).not.toContain("storageKey");
    expect(JSON.stringify(body)).not.toContain("uploads/user/file.txt");
  });

  it("paginates project documents with a stable timestamp and link ID cursor", async () => {
    const timestamp = new Date("2026-11-07T12:00:00.000Z");
    const rows = Array.from({ length: 101 }, (_, index) => ({
      id: `item-${index}`,
      linkId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      collectionId,
      filename: `notes-${index}.txt`,
      mediaType: "text/plain",
      status: "ready",
      createdAt: timestamp,
    }));
    mocks.select.mockReturnValueOnce(builder(rows));

    const firstResponse = await GET(
      new Request(`http://localhost/api/projects/${projectId}/documents`),
      params,
    );
    const firstPage = await firstResponse.json();
    expect(firstPage.documents).toHaveLength(100);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(firstPage.documents[99]).not.toHaveProperty("linkId");

    mocks.select.mockReturnValueOnce(
      builder([
        {
          ...rows[100],
          id: "item-older",
          linkId: "00000000-0000-4000-8000-000000000999",
        },
      ]),
    );
    const secondResponse = await GET(
      new Request(
        `http://localhost/api/projects/${projectId}/documents?cursor=${encodeURIComponent(firstPage.nextCursor)}`,
      ),
      params,
    );
    const secondPage = await secondResponse.json();
    expect(
      secondPage.documents.map((document: { id: string }) => document.id),
    ).toEqual(["item-older"]);
    expect(secondPage.nextCursor).toBeNull();
    const cursorQuery = new PgDialect().sqlToQuery(
      mocks.predicates[1] as never,
    );
    expect(cursorQuery.sql).toContain('"project_document"."created_at" <');
    expect(cursorQuery.sql).toContain('"project_document"."id" <');
    expect(cursorQuery.sql).toContain('"project_document"."project_id" =');
    expect(cursorQuery.sql).toContain('"collection_item"."collection_id" in');
    expect(cursorQuery.sql).toContain('"collection"."user_id" in');
  });

  it("rejects malformed page cursors before querying documents", async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/projects/${projectId}/documents?cursor=bad`,
      ),
      params,
    );
    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("stores original bytes privately and indexes the same parsed text into the attached collection", async () => {
    const response = await POST(uploadRequest(), params);
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.document).toMatchObject({
      id: "item-id",
      status: "ready",
      filename: "notes.txt",
    });
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ ownerId: userId }),
    );
    expect(mocks.ingestText).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionId,
        text: "hello project",
        storageKey: "uploads/user/file.txt",
      }),
    );
    expect(mocks.enqueueProjectBrainForIngest).toHaveBeenCalledWith({
      userId,
      collectionId,
      itemId: "item-id",
    });
    expect(JSON.stringify(body)).not.toContain("uploads/user/file.txt");
  });

  it.each([
    ["forecast.xlsx", "xlsx", "Workbook text: Q1 revenue"],
    ["roadmap.pptx", "pptx", "Slide text: Launch plan"],
  ])(
    "ingests bounded %s extraction into its attached knowledge collection",
    async (filename, kind, text) => {
      mocks.parseDocument.mockResolvedValueOnce({ text, kind });
      const response = await POST(uploadRequest(filename), params);
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.document).toMatchObject({
        id: "item-id",
        collectionId,
        filename,
        status: "ready",
      });
      expect(mocks.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ ownerId: userId }),
      );
      expect(mocks.ingestText).toHaveBeenCalledWith(
        expect.objectContaining({
          collectionId,
          actorUserId: userId,
          text,
          storageKey: "uploads/user/file.txt",
        }),
      );
      expect(JSON.stringify(body)).not.toContain("uploads/user/file.txt");
    },
  );

  it("keeps an uploaded document successful if brain scheduling is unavailable", async () => {
    mocks.enqueueProjectBrainForIngest.mockRejectedValueOnce(
      new Error("queue unavailable"),
    );
    const response = await POST(uploadRequest(), params);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      document: { id: "item-id", status: "ready" },
    });
    expect(mocks.deleteFile).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("rejects viewers and unattached collections before storing bytes", async () => {
    mocks.getProjectAccess.mockResolvedValue({ ...access, role: "viewer" });
    expect((await POST(uploadRequest(), params)).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();

    mocks.getProjectAccess.mockResolvedValue(access);
    expect(
      (
        await POST(
          uploadRequest("notes.txt", "00000000-0000-4000-8000-000000000099"),
          params,
        )
      ).status,
    ).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("requires private cloud storage for project document originals", async () => {
    const priorBlobAccess = process.env.VERCEL_BLOB_ACCESS;
    try {
      mocks.storageDriver = "vercel-blob";
      delete process.env.VERCEL_BLOB_ACCESS;
      const response = await POST(uploadRequest(), params);
      expect(response.status).toBe(503);
      expect(mocks.upload).not.toHaveBeenCalled();
    } finally {
      if (priorBlobAccess === undefined) delete process.env.VERCEL_BLOB_ACCESS;
      else process.env.VERCEL_BLOB_ACCESS = priorBlobAccess;
      mocks.storageDriver = "local";
    }
  });

  it("rejects active and unsupported types before storage", async () => {
    mocks.isParseableDocument.mockReturnValue(false);
    expect((await POST(uploadRequest("notes.html"), params)).status).toBe(415);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects oversized multipart requests before parsing the body", async () => {
    const request = new Request(
      `http://localhost/api/projects/${projectId}/documents`,
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Length": String(22 * 1024 * 1024),
        },
      },
    );
    const response = await POST(request, params);
    expect(response.status).toBe(413);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("bounds multipart bodies when Content-Length is absent", async () => {
    const bytes = new Uint8Array(22 * 1024 * 1024);
    const request = new Request(
      `http://localhost/api/projects/${projectId}/documents`,
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "multipart/form-data; boundary=unused",
        },
        body: bytes,
      },
    );
    const response = await POST(request, params);
    expect(response.status).toBe(413);
    expect(mocks.parseDocument).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects parse failures without exposing parser details", async () => {
    mocks.parseDocument.mockRejectedValue(new Error("internal parser detail"));
    const response = await POST(uploadRequest(), params);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Could not parse document",
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rolls back the original object and partial collection item after indexing fails", async () => {
    mocks.ingestText.mockRejectedValue(
      new IngestError("embedding failure", "item-id"),
    );
    const response = await POST(uploadRequest(), params);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Project document upload failed",
    });
    expect(mocks.deleteFile).toHaveBeenCalledWith("uploads/user/file.txt");
    expect(mocks.delete).toHaveBeenCalled();
  });
});
