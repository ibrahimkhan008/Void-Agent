import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteOwnedCollectionItem: vi.fn(),
  getOwnedCollection: vi.fn(),
  ingestOwnedCollectionFile: vi.fn(),
  ingestOwnedCollectionText: vi.fn(),
  listOwnedCollectionItems: vi.fn(),
  downloadPublicTextUrl: vi.fn(),
  sameOrigin: vi.fn(),
}));

vi.mock("auth/route-guard", () => ({
  withAuth:
    (handler: (...args: any[]) => unknown) =>
    (request: Request, context: { params: Promise<{ id: string }> }) =>
      handler(request, { user: { id: "owner-1" } }, context),
}));
vi.mock("@/lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("@/lib/collections/secure-url-ingest", () => ({
  downloadPublicTextUrl: mocks.downloadPublicTextUrl,
}));
vi.mock("@/lib/collections/collection-service", () => ({
  deleteOwnedCollectionItem: mocks.deleteOwnedCollectionItem,
  getOwnedCollection: mocks.getOwnedCollection,
  ingestOwnedCollectionFile: mocks.ingestOwnedCollectionFile,
  ingestOwnedCollectionText: mocks.ingestOwnedCollectionText,
  listOwnedCollectionItems: mocks.listOwnedCollectionItems,
}));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ id: "collection-1" }) };
const postRequest = (body: unknown) =>
  new NextRequest("https://app.test/api/collections/collection-1/items", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/collections/[id]/items", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AGENTSET_API_KEY", "test-key");
    mocks.sameOrigin.mockReturnValue(true);
    mocks.getOwnedCollection.mockResolvedValue({
      id: "collection-1",
      userId: "owner-1",
    });
    mocks.listOwnedCollectionItems.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    mocks.ingestOwnedCollectionText.mockResolvedValue({
      jobId: "job-1",
      status: "QUEUED",
      filename: "notes.txt",
    });
    mocks.downloadPublicTextUrl.mockResolvedValue({
      text: "public page",
      sourceOrigin: "https://example.test",
    });
    mocks.ingestOwnedCollectionFile.mockResolvedValue({
      jobId: "file-job-1",
      status: "QUEUED",
      filename: "notes.txt",
    });
  });

  it("lists items only after owner-scoped collection lookup", async () => {
    const response = await GET(
      new NextRequest("https://app.test/api/collections/collection-1/items"),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(mocks.listOwnedCollectionItems).toHaveBeenCalledWith({
      id: "collection-1",
      userId: "owner-1",
      cursor: undefined,
    });
  });

  it("rejects foreign collection access and cross-origin ingestion", async () => {
    mocks.getOwnedCollection.mockResolvedValue(null);
    expect((await POST(postRequest({ text: "secret" }), context)).status).toBe(
      404,
    );
    expect(mocks.ingestOwnedCollectionText).not.toHaveBeenCalled();
    mocks.getOwnedCollection.mockResolvedValue({
      id: "collection-1",
      userId: "owner-1",
    });
    mocks.sameOrigin.mockReturnValue(false);
    expect((await POST(postRequest({ text: "secret" }), context)).status).toBe(
      403,
    );
  });

  it("submits bounded text and public URL content as async ingestion jobs", async () => {
    const text = await POST(
      postRequest({ text: "Meeting notes", filename: "meeting.txt" }),
      context,
    );
    expect(text.status).toBe(202);
    expect(mocks.ingestOwnedCollectionText).toHaveBeenCalledWith({
      id: "collection-1",
      userId: "owner-1",
      text: "Meeting notes",
      filename: "meeting.txt",
    });

    const url = await POST(
      postRequest({ url: "https://example.test/page" }),
      context,
    );
    expect(url.status).toBe(202);
    expect(mocks.downloadPublicTextUrl).toHaveBeenCalledWith(
      "https://example.test/page",
    );
    expect(mocks.ingestOwnedCollectionText).toHaveBeenLastCalledWith({
      id: "collection-1",
      userId: "owner-1",
      text: "public page",
      filename: "example.test.txt",
      sourceOrigin: "https://example.test",
    });
  });

  it("validates and uploads text files without returning storage keys", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(["safe file text"], "notes.txt", { type: "text/plain" }),
    );
    const request = new NextRequest(
      "https://app.test/api/collections/collection-1/items",
      {
        method: "POST",
        headers: { origin: "https://app.test" },
        body: form,
      },
    );
    const response = await POST(request, context);
    expect(response.status).toBe(202);
    expect(mocks.ingestOwnedCollectionFile).toHaveBeenCalledWith({
      id: "collection-1",
      userId: "owner-1",
      file: expect.any(File),
      filename: "notes.txt",
      contentType: "text/plain",
    });
    expect(await response.json()).toEqual({
      jobId: "file-job-1",
      status: "QUEUED",
      filename: "notes.txt",
    });
  });

  it("rejects a fake PDF before managed upload", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(["this is not a PDF"], "fake.pdf", { type: "application/pdf" }),
    );
    const request = new NextRequest(
      "https://app.test/api/collections/collection-1/items",
      {
        method: "POST",
        headers: { origin: "https://app.test" },
        body: form,
      },
    );
    expect((await POST(request, context)).status).toBe(415);
    expect(mocks.ingestOwnedCollectionFile).not.toHaveBeenCalled();
  });

  it("rejects unsupported content types and malformed JSON", async () => {
    expect(
      (
        await POST(
          new NextRequest(
            "https://app.test/api/collections/collection-1/items",
            {
              method: "POST",
              headers: {
                origin: "https://app.test",
                "content-type": "text/plain",
              },
              body: "hi",
            },
          ),
          context,
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await POST(
          new NextRequest(
            "https://app.test/api/collections/collection-1/items",
            {
              method: "POST",
              headers: {
                origin: "https://app.test",
                "content-type": "application/json",
              },
              body: "{",
            },
          ),
          context,
        )
      ).status,
    ).toBe(400);
  });
});
