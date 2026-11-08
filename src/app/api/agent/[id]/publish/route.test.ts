import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canEditAgent: vi.fn(),
  getStatus: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
  rateLimit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/auth/permissions", () => ({
  canEditAgent: mocks.canEditAgent,
}));
vi.mock("lib/db/repository", () => ({
  agentInstallRepository: {
    getAgentPublicationStatus: mocks.getStatus,
    publishAgent: mocks.publish,
    unpublishAgent: mocks.unpublish,
  },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { DELETE, GET, POST } from "./route";

const params = Promise.resolve({ id: "agent-1" });
const status = {
  publishedAt: new Date("2026-11-08T12:00:00.000Z"),
  visibility: "public" as const,
};

function request(method: string, origin = "https://app.example") {
  return new Request("https://app.example/api/agent/agent-1/publish", {
    method,
    headers: { Origin: origin },
  });
}

describe("agent gallery publication lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.canEditAgent.mockResolvedValue(true);
    mocks.getStatus.mockResolvedValue(status);
    mocks.publish.mockResolvedValue(status);
    mocks.unpublish.mockResolvedValue(true);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
  });

  it("exposes publication state only to the authenticated owner", async () => {
    const response = await GET(request("GET"), { params });
    expect(response.status).toBe(200);
    expect(mocks.getStatus).toHaveBeenCalledWith("owner-1", "agent-1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      publishedAt: "2026-11-08T12:00:00.000Z",
      visibility: "public",
    });

    mocks.getStatus.mockResolvedValueOnce(null);
    expect((await GET(request("GET"), { params })).status).toBe(404);
  });

  it("requires authentication, same-origin and edit permission before publishing", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request("POST"), { params })).status).toBe(401);

    expect(
      (await POST(request("POST", "https://attacker.example"), { params }))
        .status,
    ).toBe(403);

    mocks.canEditAgent.mockResolvedValueOnce(false);
    expect((await POST(request("POST"), { params })).status).toBe(403);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("publishes only an owner-scoped agent already shared publicly", async () => {
    const response = await POST(request("POST"), { params });
    expect(response.status).toBe(200);
    expect(mocks.publish).toHaveBeenCalledWith("owner-1", "agent-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/gallery/agents");

    mocks.publish.mockResolvedValueOnce(null);
    mocks.getStatus.mockResolvedValueOnce({
      publishedAt: null,
      visibility: "private",
    });
    const privateResponse = await POST(request("POST"), { params });
    expect(privateResponse.status).toBe(409);
    expect(await privateResponse.json()).toMatchObject({
      error: "Set agent visibility to public or readonly before publishing",
    });

    mocks.publish.mockResolvedValueOnce(null);
    mocks.getStatus.mockResolvedValueOnce(null);
    expect((await POST(request("POST"), { params })).status).toBe(404);
  });

  it("unpublishes only the authenticated owner's agent and invalidates the gallery", async () => {
    const response = await DELETE(request("DELETE"), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publishedAt: null });
    expect(mocks.unpublish).toHaveBeenCalledWith("owner-1", "agent-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/gallery/agents");

    mocks.unpublish.mockResolvedValueOnce(false);
    expect((await DELETE(request("DELETE"), { params })).status).toBe(404);
  });

  it("rejects cross-origin unpublish requests before changing state", async () => {
    const response = await DELETE(
      request("DELETE", "https://attacker.example"),
      { params },
    );
    expect(response.status).toBe(403);
    expect(mocks.unpublish).not.toHaveBeenCalled();
  });
});
