import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sameOrigin: vi.fn(),
  createActions: vi.fn(),
  search: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/ai/composio-voice-tools", () => ({
  createComposioVoiceActions: mocks.createActions,
}));

import { POST } from "./route";

const request = (body: string) =>
  new Request("https://app.test/api/voice/composio-tool", {
    method: "POST",
    headers: {
      Origin: "https://app.test",
      "Content-Type": "application/json",
    },
    body,
  });

describe("POST /api/voice/composio-tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.search.mockResolvedValue({ success: true, actions: [] });
    mocks.execute.mockResolvedValue({ success: true, result: "{}" });
    mocks.createActions.mockImplementation(() => ({
      search: mocks.search,
      execute: mocks.execute,
    }));
  });

  it("rejects foreign origins before session lookup or service construction", async () => {
    mocks.sameOrigin.mockReturnValue(false);
    const response = await POST(
      request(JSON.stringify({ operation: "search", query: "repos" })) as never,
    );

    expect(response.status).toBe(403);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.createActions).not.toHaveBeenCalled();
  });

  it("requires an authenticated user before constructing the service", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(
      request(JSON.stringify({ operation: "search", query: "repos" })) as never,
    );

    expect(response.status).toBe(401);
    expect(mocks.createActions).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before dispatch", async () => {
    const response = await POST(request("not-json") as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Invalid request body",
    });
    expect(mocks.createActions).not.toHaveBeenCalled();
  });

  it("rejects streamed bodies over 32 KB before dispatch", async () => {
    const response = await POST(
      request(
        JSON.stringify({ operation: "search", query: "x".repeat(32_100) }),
      ) as never,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Invalid request body",
    });
    expect(mocks.createActions).not.toHaveBeenCalled();
  });

  it("dispatches authenticated search and execute operations to the user-scoped service", async () => {
    const searchResponse = await POST(
      request(
        JSON.stringify({
          operation: "search",
          query: "repositories",
          accountRef: "opaque-ref",
        }),
      ) as never,
    );
    expect(searchResponse.status).toBe(200);
    expect(searchResponse.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(await searchResponse.json()).toEqual({ success: true, actions: [] });
    expect(mocks.createActions).toHaveBeenCalledWith("user-1");
    expect(mocks.search).toHaveBeenCalledWith({
      query: "repositories",
      accountRef: "opaque-ref",
    });

    const executeResponse = await POST(
      request(
        JSON.stringify({
          operation: "execute",
          accountRef: "opaque-ref",
          actionSlug: "GITHUB_LIST_REPOSITORIES",
          arguments: { owner: "acme" },
        }),
      ) as never,
    );
    expect(executeResponse.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith({
      accountRef: "opaque-ref",
      actionSlug: "GITHUB_LIST_REPOSITORIES",
      arguments: { owner: "acme" },
    });
  });
});
