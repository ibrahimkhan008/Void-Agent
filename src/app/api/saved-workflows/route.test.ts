import { beforeEach, describe, expect, it, vi } from "vitest";

const { session, selectByUserId, save, rateLimit, sameOrigin, canCreate } =
  vi.hoisted(() => ({
    session: vi.fn(),
    selectByUserId: vi.fn(),
    save: vi.fn(),
    rateLimit: vi.fn(),
    sameOrigin: vi.fn(),
    canCreate: vi.fn(),
  }));
vi.mock("auth/server", () => ({ getSession: session }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: { selectByUserId, save },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: rateLimit,
}));
vi.mock("lib/security/same-origin", () => ({ hasSameOrigin: sameOrigin }));
vi.mock("lib/auth/permissions", () => ({ canCreateWorkflow: canCreate }));

import { GET, POST } from "./route";

describe("saved workflow collection routes", () => {
  beforeEach(() => {
    session.mockReset();
    selectByUserId.mockReset();
    save.mockReset();
    rateLimit.mockReset();
    sameOrigin.mockReset();
    canCreate.mockReset();
    sameOrigin.mockReturnValue(true);
    canCreate.mockResolvedValue(true);
    rateLimit.mockResolvedValue({ allowed: true });
  });

  it("lists only the authenticated user's saved workflows", async () => {
    session.mockResolvedValue({ user: { id: "owner" } });
    selectByUserId.mockResolvedValue([
      {
        id: "wf-1",
        name: "Private",
        userId: "owner",
        isPublished: false,
        visibility: "private",
        updatedAt: new Date(),
      },
      {
        id: "wf-2",
        name: "Published",
        userId: "owner",
        isPublished: true,
        visibility: "public",
        updatedAt: new Date(),
      },
    ]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(selectByUserId).toHaveBeenCalledWith("owner");
    expect(await response.json()).toEqual([
      expect.objectContaining({ id: "wf-1", name: "Private" }),
    ]);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("creates only private unpublished owner drafts", async () => {
    session.mockResolvedValue({ user: { id: "owner" } });
    save.mockResolvedValue({
      id: "wf-1",
      name: "Draft",
      userId: "owner",
      isPublished: false,
      visibility: "private",
    });
    const response = await POST(
      new Request("http://local/api/saved-workflows", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://local" },
        body: JSON.stringify({ name: "Draft" }),
      }),
    );
    expect(response.status).toBe(201);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Draft",
        userId: "owner",
        isPublished: false,
        visibility: "private",
      }),
    );
    expect(save.mock.calls[0]?.[0]).not.toHaveProperty("orgId");
  });

  it("rejects unauthorized and cross-origin writes before persistence", async () => {
    session.mockResolvedValue(null);
    expect(
      (
        await POST(
          new Request("http://local/api/saved-workflows", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(401);
    session.mockResolvedValue({ user: { id: "owner" } });
    sameOrigin.mockReturnValue(false);
    expect(
      (
        await POST(
          new Request("http://local/api/saved-workflows", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects unsupported publish/team fields and overlong input", async () => {
    session.mockResolvedValue({ user: { id: "owner" } });
    for (const body of [
      { name: "Draft", isPublished: true },
      { name: "Draft", orgId: "team" },
      { name: "x".repeat(81) },
    ]) {
      const response = await POST(
        new Request("http://local/api/saved-workflows", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://local",
          },
          body: JSON.stringify(body),
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(save).not.toHaveBeenCalled();
  });
});
