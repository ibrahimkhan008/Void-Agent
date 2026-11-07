import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getTeam: vi.fn(),
  getTeamMember: vi.fn(),
  listAudits: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/db/repository", () => ({
  teamRepository: { getTeam: mocks.getTeam, getTeamMember: mocks.getTeamMember },
  teamModelRoutingRepository: { listAudits: mocks.listAudits },
}));

import { GET } from "./route";

const teamId = "team-1";
const userId = "user-1";
const params = Promise.resolve({ teamId });
const route = (query = "") =>
  GET(new Request(`https://example.test/api/teams/${teamId}/model-routing/audit${query}`), { params });

describe("GET team model-routing audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: userId } });
    mocks.getTeam.mockResolvedValue({ id: teamId, ownerId: "owner-1" });
    mocks.getTeamMember.mockResolvedValue({ role: "admin" });
    mocks.listAudits.mockResolvedValue([]);
  });

  it("returns a bounded page with only privacy-minimal route fields and an opaque cursor", async () => {
    const createdAt = new Date("2026-11-07T10:00:00.000Z");
    mocks.listAudits.mockResolvedValueOnce([
      { id: "10000000-0000-4000-8000-000000000001", taskKey: "coding", selectedProvider: "flare", selectedModel: "Model A", reasonCode: "task_ranked", createdAt },
      { id: "10000000-0000-4000-8000-000000000002", taskKey: "writing", selectedProvider: "google", selectedModel: "Model B", reasonCode: "task_ranked", createdAt },
      { id: "10000000-0000-4000-8000-000000000003", taskKey: "vision", selectedProvider: "flare", selectedModel: "Model C", reasonCode: "fallback_model_unavailable", createdAt },
    ]);

    const response = await route("?limit=2");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toEqual({
      id: "10000000-0000-4000-8000-000000000001",
      taskKey: "coding",
      selectedProvider: "flare",
      selectedModel: "Model A",
      reasonCode: "task_ranked",
      createdAt: createdAt.toISOString(),
    });
    expect(body.items[0]).not.toHaveProperty("userId");
    expect(body.items[0]).not.toHaveProperty("threadId");
    expect(body.nextCursor).toEqual(expect.any(String));
    expect(mocks.listAudits).toHaveBeenCalledWith(teamId, { limit: 2, cursor: undefined });
  });

  it("requires an active team member with owner or admin privileges", async () => {
    mocks.getTeamMember.mockResolvedValueOnce(null);
    expect((await route()).status).toBe(404);
    mocks.getTeamMember.mockResolvedValueOnce({ role: "member" });
    expect((await route()).status).toBe(403);
    expect(mocks.listAudits).not.toHaveBeenCalled();
  });

  it("rejects invalid limits and cursors before querying audit rows", async () => {
    expect((await route("?limit=1000")).status).toBe(400);
    expect((await route("?cursor=not-base64-json")).status).toBe(400);
    expect(mocks.listAudits).not.toHaveBeenCalled();
  });

  it("validates and scopes a decoded keyset cursor before querying the team page", async () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const createdAt = "2026-11-07T10:00:00.000Z";
    const cursor = Buffer.from(JSON.stringify({ id, createdAt })).toString("base64url");
    const response = await route(`?limit=7&cursor=${encodeURIComponent(cursor)}`);
    expect(response.status).toBe(200);
    expect(mocks.listAudits).toHaveBeenCalledWith(teamId, {
      limit: 7,
      cursor: { id, createdAt: new Date(createdAt) },
    });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await route()).status).toBe(401);
    expect(mocks.getTeam).not.toHaveBeenCalled();
  });
});
