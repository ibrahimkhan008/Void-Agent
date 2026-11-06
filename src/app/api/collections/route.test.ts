import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  teams: vi.fn(),
  role: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("@/app/api/chat/shared.chat", () => ({
  handleError: (error: unknown) => String(error),
}));
vi.mock("lib/db/repository", () => ({
  collectionRepository: {
    listAccessibleCollections: mocks.list,
    createCollection: mocks.create,
  },
}));
vi.mock("lib/projects/access", () => ({
  listProjectTeamsForUser: mocks.teams,
  getTeamRole: mocks.role,
}));

import { GET, POST } from "./route";
const origin = "https://app.example";

describe("/api/collections team sharing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.teams.mockResolvedValue([{ id: "team-1", role: "editor" }]);
    mocks.list.mockResolvedValue([]);
    mocks.role.mockResolvedValue("editor");
    mocks.create.mockResolvedValue({ id: "collection-1", orgId: "team-1" });
  });

  it("lists only personal and current-team collection scopes", async () => {
    expect((await GET()).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("user-1", ["team-1"]);
  });

  it("creates a team-scoped collection only for a current editor/owner", async () => {
    const request = new Request(`${origin}/api/collections`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Shared docs",
        teamId: "00000000-0000-4000-8000-000000000001",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "00000000-0000-4000-8000-000000000001",
      }),
      "user-1",
    );
  });

  it("rejects viewer, cross-origin, and missing-origin mutations before writes", async () => {
    mocks.role.mockResolvedValueOnce("viewer");
    const viewer = await POST(
      new Request(`${origin}/api/collections`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "No",
          teamId: "00000000-0000-4000-8000-000000000001",
        }),
      }),
    );
    const cross = await POST(
      new Request(`${origin}/api/collections`, {
        method: "POST",
        headers: {
          Origin: "https://attacker.invalid",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "No" }),
      }),
    );
    const missing = await POST(
      new Request(`${origin}/api/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "No" }),
      }),
    );
    expect([viewer.status, cross.status, missing.status]).toEqual([
      403, 403, 403,
    ]);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
