import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  select: vi.fn(),
  createTeamMember: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { select: mocks.select },
}));
vi.mock("lib/db/repository", () => ({
  teamRepository: { createTeamMember: mocks.createTeamMember },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { POST } from "./route";

const params = { teamId: "00000000-0000-4000-8000-000000000010" };
const teamOwnerId = "00000000-0000-4000-8000-000000000011";
const newMemberId = "00000000-0000-4000-8000-000000000012";

function request(
  body: unknown,
  options: { origin?: string; method?: string } = {},
) {
  return new Request("https://example.test/api/teams/team-id/members", {
    method: options.method ?? "POST",
    headers: {
      origin: options.origin ?? "https://example.test",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function query(rows: unknown[]) {
  return { from: () => ({ where: async () => rows }) };
}

describe("team member addition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: teamOwnerId } });
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mocks.createTeamMember.mockResolvedValue({
      userId: newMemberId,
      role: "viewer",
    });
  });

  it("allows a team owner to add an existing account with a limited role", async () => {
    mocks.select
      .mockReturnValueOnce(query([{ id: params.teamId, ownerId: teamOwnerId }]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ id: newMemberId }]))
      .mockReturnValueOnce(query([]));
    const inserted = { userId: newMemberId, role: "viewer" };

    const response = await POST(
      request({ email: " NEW@EXAMPLE.TEST ", role: "viewer" }),
      { params: Promise.resolve(params) },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ member: inserted });
    expect(mocks.createTeamMember).toHaveBeenCalledWith(
      params.teamId,
      newMemberId,
      "viewer",
    );
  });

  it("allows team admins but never permits assigning the admin role", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: newMemberId } });
    mocks.select
      .mockReturnValueOnce(query([{ id: params.teamId, ownerId: teamOwnerId }]))
      .mockReturnValueOnce(query([{ role: "admin" }]));
    const response = await POST(
      request({ email: "person@example.test", role: "admin" }),
      { params: Promise.resolve(params) },
    );
    expect(response.status).toBe(400);
    expect(mocks.createTeamMember).not.toHaveBeenCalled();
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it("allows a team admin to add a lower-privilege member", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: newMemberId } });
    mocks.select
      .mockReturnValueOnce(query([{ id: params.teamId, ownerId: teamOwnerId }]))
      .mockReturnValueOnce(query([{ role: "admin" }]))
      .mockReturnValueOnce(query([{ id: "new-user" }]))
      .mockReturnValueOnce(query([]));
    mocks.createTeamMember.mockResolvedValueOnce({
      userId: "new-user",
      role: "member",
    });
    const response = await POST(
      request({ email: "person@example.test", role: "member" }),
      { params: Promise.resolve(params) },
    );
    expect(response.status).toBe(201);
    expect(mocks.createTeamMember).toHaveBeenCalledWith(
      params.teamId,
      "new-user",
      "member",
    );
  });

  it("denies regular members before resolving or adding a target", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: newMemberId } });
    mocks.select
      .mockReturnValueOnce(query([{ id: params.teamId, ownerId: teamOwnerId }]))
      .mockReturnValueOnce(query([{ role: "member" }]));
    const response = await POST(request({ email: "person@example.test" }), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(403);
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.createTeamMember).not.toHaveBeenCalled();
  });

  it("does not let a user from another team manage this team", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: newMemberId } });
    mocks.select
      .mockReturnValueOnce(query([{ id: params.teamId, ownerId: teamOwnerId }]))
      .mockReturnValueOnce(query([]));
    const response = await POST(request({ email: "person@example.test" }), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(404);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.createTeamMember).not.toHaveBeenCalled();
  });

  it("requires same origin and an authenticated owner or admin", async () => {
    const foreignOrigin = await POST(
      request(
        { email: "person@example.test" },
        { origin: "https://attacker.test" },
      ),
      { params: Promise.resolve(params) },
    );
    expect(foreignOrigin.status).toBe(403);
    expect(mocks.getSession).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValueOnce(null);
    const unauthenticated = await POST(
      request({ email: "person@example.test" }),
      { params: Promise.resolve(params) },
    );
    expect(unauthenticated.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("does not allow duplicate membership or adding the team owner", async () => {
    mocks.select
      .mockReturnValueOnce(query([{ id: params.teamId, ownerId: teamOwnerId }]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ id: teamOwnerId }]));
    const ownerResponse = await POST(request({ email: "owner@example.test" }), {
      params: Promise.resolve(params),
    });
    expect(ownerResponse.status).toBe(409);
    expect(mocks.createTeamMember).not.toHaveBeenCalled();

    mocks.select
      .mockReturnValueOnce(query([{ id: params.teamId, ownerId: teamOwnerId }]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ id: newMemberId }]))
      .mockReturnValueOnce(query([{ id: "existing-membership" }]));
    const duplicateResponse = await POST(
      request({ email: "person@example.test" }),
      { params: Promise.resolve(params) },
    );
    expect(duplicateResponse.status).toBe(409);
    expect(mocks.createTeamMember).not.toHaveBeenCalled();
  });

  it("rejects unknown accounts and invalid team identifiers", async () => {
    mocks.select
      .mockReturnValueOnce(query([{ id: params.teamId, ownerId: teamOwnerId }]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([]));
    const unknown = await POST(request({ email: "missing@example.test" }), {
      params: Promise.resolve(params),
    });
    expect(unknown.status).toBe(404);

    mocks.select.mockClear();
    const invalidTeam = await POST(request({ email: "person@example.test" }), {
      params: Promise.resolve({ teamId: "not-a-uuid" }),
    });
    expect(invalidTeam.status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("uses an atomic uniqueness guard if membership is added concurrently", async () => {
    mocks.select
      .mockReturnValueOnce(query([{ id: params.teamId, ownerId: teamOwnerId }]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ id: newMemberId }]))
      .mockReturnValueOnce(query([]));
    mocks.createTeamMember.mockResolvedValueOnce(null);
    const response = await POST(request({ email: "person@example.test" }), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rate limits repeated additions by team and caller", async () => {
    mocks.select
      .mockReturnValueOnce(query([{ id: params.teamId, ownerId: teamOwnerId }]))
      .mockReturnValueOnce(query([]));
    mocks.rateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterMs: 2_000,
    });
    const response = await POST(request({ email: "person@example.test" }), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("2");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });
});
