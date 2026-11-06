import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  mayEditProject: vi.fn(),
  checkApiRateLimit: vi.fn(),
  recomputeProjectBrainSalience: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  mayEditProject: mocks.mayEditProject,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/projects/recompute-brain-salience", () => ({
  recomputeProjectBrainSalience: mocks.recomputeProjectBrainSalience,
}));

import { POST } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const request = (origin = "http://localhost") =>
  new Request(`http://localhost/api/projects/${projectId}/brain/salience`, {
    method: "POST",
    headers: { Origin: origin },
  });
const invoke = (req = request()) =>
  POST(req, { params: Promise.resolve({ id: projectId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "editor-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    role: "editor",
    project: { collectionIds: ["collection-1"] },
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["owner-1"]);
  mocks.mayEditProject.mockReturnValue(true);
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.recomputeProjectBrainSalience.mockResolvedValue({ updated: 2 });
});

describe("POST project brain salience refresh", () => {
  it("requires same-origin editor access and passes live source scope", async () => {
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 2 });
    expect(mocks.recomputeProjectBrainSalience).toHaveBeenCalledWith({
      projectId,
      collectionIds: ["collection-1"],
      ownerIds: ["owner-1"],
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a cross-origin request", async () => {
    const response = await invoke(request("https://attacker.invalid"));
    expect(response.status).toBe(403);
    expect(mocks.getProjectAccess).not.toHaveBeenCalled();
  });

  it("rejects viewers and rate-limits refreshes", async () => {
    mocks.mayEditProject.mockReturnValue(false);
    expect((await invoke()).status).toBe(403);
    expect(mocks.recomputeProjectBrainSalience).not.toHaveBeenCalled();

    mocks.mayEditProject.mockReturnValue(true);
    mocks.checkApiRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterMs: 5000,
    });
    const response = await invoke();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(mocks.recomputeProjectBrainSalience).not.toHaveBeenCalled();
  });
});
