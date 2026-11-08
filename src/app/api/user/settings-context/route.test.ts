import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  getUserAccounts: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/user/server", () => ({
  getUser: mocks.getUser,
  getUserAccounts: mocks.getUserAccounts,
}));

import { GET } from "./route";

describe("GET /api/user/settings-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.getUser.mockResolvedValue({
      id: "owner-1",
      name: "Ada",
      email: "ada@example.test",
    });
    mocks.getUserAccounts.mockResolvedValue({
      hasPassword: true,
      oauthProviders: ["google"],
      accounts: [
        {
          providerId: "credential",
          accessToken: "must-not-leak",
          refreshToken: "must-not-leak",
        },
      ],
    });
  });

  it("returns only the authenticated user's profile and safe account summary", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.getUser).toHaveBeenCalledWith("owner-1");
    expect(mocks.getUserAccounts).toHaveBeenCalledWith("owner-1");
    const body = await response.json();
    expect(body).toEqual({
      currentUserId: "owner-1",
      user: { id: "owner-1", name: "Ada", email: "ada@example.test" },
      userAccountInfo: { hasPassword: true, oauthProviders: ["google"] },
    });
    expect(JSON.stringify(body)).not.toContain("must-not-leak");
  });

  it("rejects unauthenticated reads before loading account data", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.getUserAccounts).not.toHaveBeenCalled();
  });

  it("returns not found when the user record is gone", async () => {
    mocks.getUser.mockResolvedValueOnce(null);
    const response = await GET();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
