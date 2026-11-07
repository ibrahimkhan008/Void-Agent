import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rateLimit: vi.fn(),
  hasSameOrigin: vi.fn(),
  getOwnedProjectThreadScope: vi.fn(),
  getProjectStatusForUser: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.hasSameOrigin,
}));
vi.mock("lib/voice/project-status", () => ({
  getOwnedProjectThreadScope: mocks.getOwnedProjectThreadScope,
}));
vi.mock("lib/ai/tools/project-status", () => ({
  getProjectStatusForUser: mocks.getProjectStatusForUser,
}));

import { POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const threadId = "00000000-0000-4000-8000-000000000002";
const projectId = "00000000-0000-4000-8000-000000000003";

function request(body: unknown = { threadId }) {
  return new Request("https://app.test/api/voice/project-status", {
    method: "POST",
    headers: {
      Origin: "https://app.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/voice/project-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: userId } });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.hasSameOrigin.mockReturnValue(true);
    mocks.getOwnedProjectThreadScope.mockResolvedValue({
      projectId,
      collectionIds: ["collection-1"],
    });
    mocks.getProjectStatusForUser.mockResolvedValue({
      success: true,
      project: { id: projectId, name: "Release" },
      status: null,
      acceptedTasks: [],
      recentEvents: [],
      note: "No current status snapshot is available.",
    });
  });

  it("returns status only for the server-resolved owned project thread", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      success: true,
      project: { id: projectId },
    });
    expect(mocks.getOwnedProjectThreadScope).toHaveBeenCalledWith(
      userId,
      threadId,
    );
    expect(mocks.getProjectStatusForUser).toHaveBeenCalledWith({
      userId,
      projectId,
      collectionIds: ["collection-1"],
    });
  });

  it("requires authentication, same origin, and a rate allowance", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    mocks.hasSameOrigin.mockReturnValueOnce(false);
    expect((await POST(request())).status).toBe(403);
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.getOwnedProjectThreadScope).not.toHaveBeenCalled();
  });

  it("rejects malformed or client-supplied project scope", async () => {
    expect((await POST(request({ threadId, projectId }))).status).toBe(400);
    expect((await POST(request({ threadId: "bad" }))).status).toBe(400);
    expect(mocks.getOwnedProjectThreadScope).not.toHaveBeenCalled();
  });

  it("hides threads that are not owned or no longer project accessible", async () => {
    mocks.getOwnedProjectThreadScope.mockResolvedValueOnce(null);
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mocks.getProjectStatusForUser).not.toHaveBeenCalled();
  });
});
