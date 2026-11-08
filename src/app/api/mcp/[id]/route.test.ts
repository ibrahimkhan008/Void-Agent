import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  selectById: vi.fn(),
  selectAllForUser: vi.fn(),
  canManageMCPServer: vi.fn(),
  saveMcpClientAction: vi.fn(),
  removeMcpClientAction: vi.fn(),
  deleteAllByMcpServerId: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/auth/permissions", () => ({
  canManageMCPServer: mocks.canManageMCPServer,
}));
vi.mock("lib/db/pg/repositories/mcp-repository.pg", () => ({
  pgMcpRepository: {
    selectById: mocks.selectById,
    selectAllForUser: mocks.selectAllForUser,
  },
}));
vi.mock("@/app/api/mcp/actions", () => ({
  saveMcpClientAction: mocks.saveMcpClientAction,
  removeMcpClientAction: mocks.removeMcpClientAction,
}));
vi.mock("lib/db/repository", () => ({
  mcpOAuthRepository: {
    deleteAllByMcpServerId: mocks.deleteAllByMcpServerId,
  },
}));
vi.mock("lib/logger", () => ({ default: { error: vi.fn() } }));

import { PUT } from "./route";

const params = { params: Promise.resolve({ id: "mcp-1" }) };
const server = {
  id: "mcp-1",
  name: "Existing",
  config: { url: "https://old.example/mcp" },
  userId: "owner-1",
  visibility: "private",
};

function request(body: unknown) {
  return new Request("https://app.example/api/mcp/mcp-1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("PUT /api/mcp/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.selectById.mockResolvedValue(server);
    mocks.selectAllForUser.mockResolvedValue([server]);
    mocks.canManageMCPServer.mockResolvedValue(true);
    mocks.saveMcpClientAction.mockResolvedValue({
      client: { getInfo: () => ({ id: "mcp-1" }) },
    });
    mocks.deleteAllByMcpServerId.mockResolvedValue(undefined);
  });

  it("requires an authenticated user before reading or changing server data", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PUT(
      request({ name: "New", config: { url: "https://mcp.example/mcp" } }),
      params,
    );
    expect(response.status).toBe(401);
    expect(mocks.selectById).not.toHaveBeenCalled();
    expect(mocks.saveMcpClientAction).not.toHaveBeenCalled();
  });

  it("rejects edits when the caller cannot manage the server", async () => {
    mocks.canManageMCPServer.mockResolvedValue(false);
    const response = await PUT(
      request({ name: "New", config: { url: "https://mcp.example/mcp" } }),
      params,
    );
    expect(response.status).toBe(403);
    expect(mocks.saveMcpClientAction).not.toHaveBeenCalled();
  });

  it("updates the owned server through the existing validated persistence path", async () => {
    const config = {
      url: "https://mcp.example/mcp",
      headers: { Authorization: "Bearer redacted" },
    };
    const response = await PUT(request({ name: "New", config }), params);
    expect(response.status).toBe(200);
    expect(mocks.saveMcpClientAction).toHaveBeenCalledWith({
      id: "mcp-1",
      name: "New",
      config,
      userId: "owner-1",
      visibility: "private",
    });
  });

  it("clears server OAuth state before changing the endpoint URL", async () => {
    const response = await PUT(
      request({ name: "Existing", config: { url: "https://new.example/mcp" } }),
      params,
    );
    expect(response.status).toBe(200);
    expect(mocks.deleteAllByMcpServerId).toHaveBeenCalledWith("mcp-1");
    expect(mocks.saveMcpClientAction).toHaveBeenCalledTimes(1);
  });

  it("retains OAuth state for same-endpoint credential edits", async () => {
    const response = await PUT(
      request({
        name: "Existing",
        config: {
          url: "https://old.example/mcp",
          headers: { Authorization: "Bearer replacement-secret" },
        },
      }),
      params,
    );
    expect(response.status).toBe(200);
    expect(mocks.deleteAllByMcpServerId).not.toHaveBeenCalled();
  });

  it("rejects malformed endpoint configuration before persistence", async () => {
    const response = await PUT(
      request({ name: "New", config: { url: "not a URL" } }),
      params,
    );
    expect(response.status).toBe(400);
    expect(mocks.saveMcpClientAction).not.toHaveBeenCalled();
  });

  it("prevents duplicate names among the owner's servers", async () => {
    mocks.selectAllForUser.mockResolvedValue([
      server,
      { ...server, id: "mcp-2", name: "Taken" },
    ]);
    const response = await PUT(
      request({ name: "Taken", config: server.config }),
      params,
    );
    expect(response.status).toBe(409);
    expect(mocks.saveMcpClientAction).not.toHaveBeenCalled();
  });
});
