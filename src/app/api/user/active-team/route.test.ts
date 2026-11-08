import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getTeamMember: vi.fn(),
  rateLimit: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/db/repository", () => ({
  teamRepository: { getTeamMember: mocks.getTeamMember },
}));
vi.mock("lib/db/pg/db.pg", () => ({
  pgDb: { update: mocks.update },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));

import { GET, POST } from "./route";

const userId = "00000000-0000-4000-8000-000000000010";
const teamId = "00000000-0000-4000-8000-000000000011";
const sessionId = "00000000-0000-4000-8000-000000000012";
const makeRequest = (team: string | null, origin = "https://example.test") =>
  new Request("https://example.test/api/user/active-team", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ teamId: team }),
  });

describe("active team session selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: userId },
      session: { id: sessionId, activeTeamId: null },
    });
    mocks.getTeamMember.mockResolvedValue({ teamId, userId, role: "member" });
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ returning: mocks.returning });
    mocks.returning.mockResolvedValue([
      { id: sessionId, activeTeamId: teamId },
    ]);
  });

  it("persists only a team the current user belongs to on their current session", async () => {
    const response = await POST(makeRequest(teamId));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activeTeamId: teamId });
    expect(mocks.getTeamMember).toHaveBeenCalledWith(teamId, userId);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.session).toHaveBeenCalledWith({ disableCookieCache: true });
  });

  it("rejects foreign teams without changing the session", async () => {
    mocks.getTeamMember.mockResolvedValueOnce(null);
    const response = await POST(makeRequest(teamId));
    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects cross-origin updates before reading auth state", async () => {
    const response = await POST(makeRequest(teamId, "https://attacker.test"));
    expect(response.status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("clears a stale team selection after membership is revoked", async () => {
    mocks.session.mockResolvedValueOnce({
      user: { id: userId },
      session: { id: sessionId, activeTeamId: teamId },
    });
    mocks.getTeamMember.mockResolvedValueOnce(null);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    mocks.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({ where: updateWhere }),
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ activeTeamId: null });
    expect(updateWhere).toHaveBeenCalledOnce();
  });
});
