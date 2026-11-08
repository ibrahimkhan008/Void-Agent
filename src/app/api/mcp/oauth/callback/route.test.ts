import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionByState: vi.fn(),
  selectById: vi.fn(),
  getClient: vi.fn(),
  refreshClient: vi.fn(),
  ensureOAuthState: vi.fn(),
  finishAuth: vi.fn(),
}));

vi.mock("@/lib/db/repository", () => ({
  mcpOAuthRepository: { getSessionByState: mocks.getSessionByState },
  mcpRepository: { selectById: mocks.selectById },
}));
vi.mock("lib/ai/mcp/mcp-manager", () => ({
  mcpClientsManager: {
    getClient: mocks.getClient,
    refreshClient: mocks.refreshClient,
  },
}));
vi.mock("lib/logger", () => ({
  default: { withDefaults: () => ({ info: vi.fn(), error: vi.fn() }) },
}));
vi.mock("consola/utils", () => ({
  colorize: (_style: string, text: string) => text,
}));

import { GET } from "./route";

const callbackRequest = (query: string) =>
  new Request(`https://app.example/api/mcp/oauth/callback?${query}`);

describe("GET /api/mcp/oauth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionByState.mockResolvedValue({
      state: "state-1",
      mcpServerId: "server-1",
    });
    mocks.selectById.mockResolvedValue({
      id: "server-1",
      userId: "owner-1",
    });
    mocks.getClient.mockResolvedValue({
      client: {
        ensureOAuthState: mocks.ensureOAuthState,
        finishAuth: mocks.finishAuth,
      },
    });
  });

  it("rejects a missing state before looking up an authorization session", async () => {
    const response = await GET(callbackRequest("code=code-1") as never);
    expect(response.status).toBe(400);
    expect(mocks.getSessionByState).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired state", async () => {
    mocks.getSessionByState.mockResolvedValue(undefined);
    const response = await GET(
      callbackRequest("code=code-1&state=unknown") as never,
    );
    expect(response.status).toBe(400);
    expect(mocks.selectById).not.toHaveBeenCalled();
  });

  it("rejects callback state whose server was removed", async () => {
    mocks.selectById.mockResolvedValue(undefined);
    const response = await GET(
      callbackRequest("code=code-1&state=state-1") as never,
    );
    expect(response.status).toBe(400);
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("adopts the exact stored state before completing the code exchange", async () => {
    const response = await GET(
      callbackRequest("code=code-1&state=state-1") as never,
    );
    expect(response.status).toBe(200);
    expect(mocks.ensureOAuthState).toHaveBeenCalledWith("state-1");
    expect(mocks.finishAuth).toHaveBeenCalledWith("code-1", "state-1");
    expect(mocks.refreshClient).toHaveBeenCalledWith("server-1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("does not report success if the owning MCP client is unavailable", async () => {
    mocks.getClient.mockResolvedValue(undefined);
    const response = await GET(
      callbackRequest("code=code-1&state=state-1") as never,
    );
    expect(response.status).toBe(500);
    expect(mocks.refreshClient).not.toHaveBeenCalled();
  });

  it("keeps provider callback text from breaking the inline script context", async () => {
    const response = await GET(
      callbackRequest(
        "error=invalid_request&error_description=%3C%2Fscript%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E",
      ) as never,
    );
    const html = await response.text();
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).not.toContain("</script><script>alert(1)</script>");
  });
});
