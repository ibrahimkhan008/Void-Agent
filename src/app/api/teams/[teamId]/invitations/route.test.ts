import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  select: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  rateLimit: vi.fn(),
  email: vi.fn(),
  baseUrl: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { select: mocks.select } }));
vi.mock("lib/db/repository", () => ({
  teamInvitationRepository: { create: mocks.create, list: mocks.list },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/const", () => ({ getBaseUrl: mocks.baseUrl }));
vi.mock("lib/email/team-invitation-email", () => ({
  sendTeamInvitationEmail: mocks.email,
}));

import { GET, POST } from "./route";

const teamId = "00000000-0000-4000-8000-000000000010";
const ownerId = "00000000-0000-4000-8000-000000000011";
const params = { teamId };
const query = (rows: unknown[]) => ({
  from: () => ({ where: async () => rows }),
});
const request = (body: unknown, origin = "https://example.test") =>
  new Request(`https://example.test/api/teams/${teamId}/invitations`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("team invitation collection routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: ownerId, name: "Owner" } });
    mocks.select
      .mockReturnValueOnce(query([{ id: teamId, ownerId, name: "Research" }]))
      .mockReturnValueOnce(query([]));
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
    mocks.baseUrl.mockReturnValue("https://example.test");
    mocks.create.mockImplementation(async (input) => ({
      status: "created",
      invitation: {
        id: "00000000-0000-4000-8000-000000000012",
        email: input.email,
        role: input.role,
        status: "pending",
        expiresAt: input.expiresAt,
        createdAt: new Date(),
      },
    }));
    mocks.email.mockResolvedValue("sent");
  });

  it("creates an account-independent invite with a hashed token and private link", async () => {
    const response = await POST(
      request({ email: " New.Person@Example.test ", role: "viewer" }),
      { params: Promise.resolve(params) },
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const body = await response.json();
    expect(body.deliveryStatus).toBe("sent");
    expect(body.acceptUrl).toMatch(
      /^https:\/\/example\.test\/team-invitations\/accept#token=/,
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new.person@example.test",
        role: "viewer",
        inviterId: ownerId,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    // The create flow never checks whether the target has a registered account.
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.email).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new.person@example.test",
        teamName: "Research",
        inviterName: "Owner",
      }),
    );
  });

  it("rejects cross-origin writes before reading the session", async () => {
    const response = await POST(
      request({ email: "new@example.test" }, "https://attacker.test"),
      { params: Promise.resolve(params) },
    );
    expect(response.status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not expose invitations to a non-manager", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "00000000-0000-4000-8000-000000000099" },
    });
    mocks.select
      .mockReset()
      .mockReturnValueOnce(query([{ id: teamId, ownerId, name: "Research" }]))
      .mockReturnValueOnce(query([{ role: "member" }]));
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
