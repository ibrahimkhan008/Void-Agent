import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canCreateAgent: vi.fn(),
  createAgentFromPreset: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/auth/permissions", () => ({
  canCreateAgent: mocks.canCreateAgent,
}));
vi.mock("lib/db/pg/repositories/agent-repository.pg", () => ({
  createAgentFromPreset: mocks.createAgentFromPreset,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { PRESET_AGENTS } from "lib/ai/agent/presets";
import { POST } from "./route";

function request(presetId: unknown = "research-agent", origin?: string) {
  return new Request("https://app.example/api/agent/from-preset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin } : { Origin: "https://app.example" }),
    },
    body: JSON.stringify({ presetId }),
  });
}

describe("POST /api/agent/from-preset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "authenticated-user" } });
    mocks.canCreateAgent.mockResolvedValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.createAgentFromPreset.mockResolvedValue({
      agentId: "created-agent-id",
      created: true,
    });
  });

  it("creates a private copy for the authenticated owner from a known preset", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ agentId: "created-agent-id" });
    expect(mocks.createAgentFromPreset).toHaveBeenCalledWith(
      "authenticated-user",
      PRESET_AGENTS.find((preset) => preset.presetId === "research-agent"),
    );
  });

  it("rejects unauthenticated users and users without create permission", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    mocks.canCreateAgent.mockResolvedValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.createAgentFromPreset).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and invalid or unknown preset requests", async () => {
    expect(
      (await POST(request("research-agent", "https://attacker.example")))
        .status,
    ).toBe(403);
    expect((await POST(request(4))).status).toBe(400);
    expect((await POST(request("missing-preset"))).status).toBe(404);
    expect(mocks.createAgentFromPreset).not.toHaveBeenCalled();
  });

  it("returns the same agent ID on idempotent re-adoption", async () => {
    mocks.createAgentFromPreset.mockResolvedValue({
      agentId: "existing-agent-id",
      created: false,
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ agentId: "existing-agent-id" });
  });
});
