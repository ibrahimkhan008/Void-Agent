import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  getProjectCollectionSourceOwnerIds: vi.fn(),
  loadContext: vi.fn(),
  generateStatus: vi.fn(),
  checkApiRateLimit: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  getProjectCollectionSourceOwnerIds: mocks.getProjectCollectionSourceOwnerIds,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/projects/project-brain-status", () => ({
  loadProjectBrainStatusContext: mocks.loadContext,
  generateProjectBrainStatus: mocks.generateStatus,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select, insert: mocks.insert },
}));

import { GET, POST } from "./route";

const projectId = "00000000-0000-4000-8000-000000000001";
const sourceContext = {
  input: { project: { name: "Launch" }, facts: [], acceptedTasks: [] },
  inputFingerprint: "a".repeat(64),
  sourceRefs: [{ sourceItemId: "item-1", sourceVersionId: "version-1" }],
};
const snapshot = {
  id: "snapshot-1",
  health: "yellow",
  progressPct: 65,
  summary: "Release work is progressing.",
  blockers: ["Review release notes"],
  createdAt: new Date("2026-11-06T10:00:00.000Z"),
};
const params = { params: Promise.resolve({ id: projectId }) };
const request = (method: "GET" | "POST", origin?: string) =>
  new Request(`http://localhost/api/projects/${projectId}/brain/status`, {
    method,
    headers: origin ? { Origin: origin } : undefined,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.getProjectAccess.mockResolvedValue({
    project: {
      id: projectId,
      name: "Launch",
      goal: null,
      description: null,
      systemPrompt: null,
      collectionIds: ["collection-1"],
    },
    role: "editor",
  });
  mocks.getProjectCollectionSourceOwnerIds.mockResolvedValue(["user-1"]);
  mocks.loadContext.mockResolvedValue(sourceContext);
  mocks.generateStatus.mockResolvedValue({
    health: "yellow",
    progressPct: 65,
    summary: "Release work is progressing.",
    blockers: ["Review release notes"],
  });
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({ orderBy: () => ({ limit: async () => [snapshot] }) }),
    }),
  });
  mocks.returning.mockResolvedValue([snapshot]);
  mocks.values.mockReturnValue({ returning: mocks.returning });
  mocks.insert.mockReturnValue({ values: mocks.values });
});

describe("project brain status snapshot API", () => {
  it("returns only a snapshot matching the caller's current visible evidence", async () => {
    const response = await GET(request("GET"), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      snapshot: { ...snapshot, createdAt: snapshot.createdAt.toISOString() },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.loadContext).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionIds: ["collection-1"],
        ownerIds: ["user-1"],
      }),
    );
  });

  it("requires an authenticated project member for reads", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(request("GET"), params)).status).toBe(401);
    mocks.getProjectAccess.mockResolvedValueOnce(null);
    expect((await GET(request("GET"), params)).status).toBe(404);
  });

  it("requires same-origin editor access before generating a summary", async () => {
    expect((await POST(request("POST"), params)).status).toBe(403);
    mocks.getProjectAccess.mockResolvedValue({
      project: { id: projectId, collectionIds: ["collection-1"] },
      role: "viewer",
    });
    expect(
      (await POST(request("POST", "https://attacker.invalid"), params)).status,
    ).toBe(403);
    mocks.getProjectAccess.mockResolvedValue({
      project: {
        id: projectId,
        name: "Launch",
        goal: null,
        description: null,
        systemPrompt: null,
        collectionIds: ["collection-1"],
      },
      role: "editor",
    });
    expect(mocks.generateStatus).not.toHaveBeenCalled();
  });

  it("returns an explicit empty-evidence response without calling the model", async () => {
    mocks.loadContext.mockResolvedValueOnce(null);
    const response = await POST(request("POST", "http://localhost"), params);
    expect(response.status).toBe(422);
    expect(mocks.generateStatus).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("persists the bounded model result with source revision provenance", async () => {
    const response = await POST(request("POST", "http://localhost"), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      snapshot: { ...snapshot, createdAt: snapshot.createdAt.toISOString() },
    });
    expect(mocks.generateStatus).toHaveBeenCalledWith(sourceContext.input);
    expect(mocks.values).toHaveBeenCalledWith({
      projectId,
      generatedByUserId: "user-1",
      inputFingerprint: sourceContext.inputFingerprint,
      sourceRefs: sourceContext.sourceRefs,
      health: "yellow",
      progressPct: 65,
      summary: "Release work is progressing.",
      blockers: ["Review release notes"],
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
