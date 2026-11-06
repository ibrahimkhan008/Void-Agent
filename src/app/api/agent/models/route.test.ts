import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, canCreateAgentMock, catalogMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  canCreateAgentMock: vi.fn(),
  catalogMock: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: getSessionMock }));
vi.mock("lib/auth/permissions", () => ({ canCreateAgent: canCreateAgentMock }));
vi.mock("lib/ai/agent/pinned-model", () => ({
  getEnabledAgentModelCatalog: catalogMock,
}));

import { GET } from "./route";

describe("GET /api/agent/models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    canCreateAgentMock.mockResolvedValue(true);
    catalogMock.mockResolvedValue([
      {
        provider: "flare",
        model: "openai/gpt-oss-120b",
        value: "flare/openai/gpt-oss-120b",
      },
    ]);
  });

  it("requires an authenticated user and agent-create permission", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    canCreateAgentMock.mockResolvedValueOnce(false);
    expect((await GET()).status).toBe(403);
    expect(catalogMock).not.toHaveBeenCalled();
  });

  it("returns only the server-provided enabled catalog without cacheability", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      models: [
        {
          provider: "flare",
          model: "openai/gpt-oss-120b",
          value: "flare/openai/gpt-oss-120b",
        },
      ],
    });
  });
});
