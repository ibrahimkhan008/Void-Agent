import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const apiMocks = vi.hoisted(() => ({
  checkAccess: vi.fn(),
  selectMessagesByThreadId: vi.fn(),
}));

vi.mock("lib/auth/api-key", () => ({
  withApiKeyUsage:
    (
      options: { getParams?: () => Promise<unknown> },
      handler: (
        request: Request,
        context: {
          apiKey: { userId: string; keyId: string; scopes: string[] };
          params?: unknown;
        },
      ) => Promise<Response>,
    ) =>
    async (request: Request) =>
      handler(request, {
        apiKey: { userId: "user-1", keyId: "key-1", scopes: ["threads:read"] },
        params: await options.getParams?.(),
      }),
}));

vi.mock("lib/db/repository", () => ({
  chatRepository: {
    checkAccess: apiMocks.checkAccess,
    selectMessagesByThreadId: apiMocks.selectMessagesByThreadId,
  },
}));

import { GET } from "./route";

const params = { params: Promise.resolve({ id: "thread-1" }) };
const request = (query = "") =>
  new Request(`https://void.test/api/v1/threads/thread-1/messages${query}`);

describe("GET /api/v1/threads/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.checkAccess.mockResolvedValue(true);
    apiMocks.selectMessagesByThreadId.mockResolvedValue([
      { id: "message-1", role: "user", parts: [{ type: "text", text: "hi" }] },
    ]);
  });

  it("preserves the legacy full-history response unless paging is requested", async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("messages");
    expect(body).not.toHaveProperty("pagination");
    expect(apiMocks.selectMessagesByThreadId).toHaveBeenCalledWith(
      "thread-1",
      undefined,
    );
  });

  it("returns a bounded page and a stable continuation cursor", async () => {
    apiMocks.selectMessagesByThreadId.mockResolvedValue([
      { id: "message-2" },
      { id: "message-1" },
    ]);
    const response = await GET(
      request("?limit=2&beforeMessageId=message-3"),
      params,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      pagination: { limit: 2, hasMore: true, nextCursor: "message-1" },
    });
    expect(apiMocks.selectMessagesByThreadId).toHaveBeenCalledWith("thread-1", {
      limit: 2,
      beforeMessageId: "message-3",
    });
  });

  it("validates limits and requires one for a cursor", async () => {
    expect((await GET(request("?limit=0"), params)).status).toBe(400);
    expect((await GET(request("?limit=51"), params)).status).toBe(400);
    expect(
      (await GET(request("?beforeMessageId=message-1"), params)).status,
    ).toBe(400);
    expect(apiMocks.selectMessagesByThreadId).not.toHaveBeenCalled();
  });

  it("checks thread access before reading messages", async () => {
    apiMocks.checkAccess.mockResolvedValue(false);
    const response = await GET(request("?limit=20"), params);
    expect(response.status).toBe(404);
    expect(apiMocks.selectMessagesByThreadId).not.toHaveBeenCalled();
  });
});
