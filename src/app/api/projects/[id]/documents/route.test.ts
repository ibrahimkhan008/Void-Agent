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
  parseDocument: vi.fn(),
  isParseableDocument: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
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
  for (const method of ["from", "innerJoin", "where", "orderBy"]) {
    value[method] = vi.fn(() => value);
  }
  value.limit = vi.fn(async () => rows);
  return value;
}

function uploadRequest(fileName = "notes.txt", collection = collectionId) {
  const form = new FormData();
  form.set("collectionId", collection);
  form.set(
    "file",
    new File(["hello project"], fileName, { type: "text/plain" }),
  );
  return new Request(`http://localhost/api/projects/${projectId}/documents`, {
    method: "POST",
    headers: { Origin: "http://localhost" },
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(JSON.stringify(body)).not.toContain("uploads/user/file.txt");
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
