import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  update: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
  mayEditProject: (role: string) => role === "owner" || role === "editor",
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { update: mocks.update } }));

import { POST } from "./route";

const params = Promise.resolve({ id: "project-1" });

function post(body: unknown) {
  return new Request("https://example.test/api/projects/project-1/onboard", {
    method: "POST",
    headers: {
      origin: "https://example.test",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("project onboarding progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.getProjectAccess.mockResolvedValue({
      role: "owner",
      project: { id: "project-1", userId: "owner-1" },
    });
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: async () => [
            {
              id: "project-1",
              onboardingStep: "tools",
              onboardingCompletedAt: null,
            },
          ],
        }),
      }),
    });
  });

  it("persists a valid resumable step for an authorized editor", async () => {
    const response = await POST(post({ step: "tools" }), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      project: { id: "project-1", onboardingStep: "tools" },
    });
  });

  it("rejects unknown steps and does not write", async () => {
    const response = await POST(post({ step: "not-a-step" }), { params });
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("requires same-origin requests and editor access", async () => {
    const crossOrigin = new Request(
      "https://example.test/api/projects/project-1/onboard",
      {
        method: "POST",
        headers: {
          origin: "https://attacker.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ step: "goal" }),
      },
    );
    expect((await POST(crossOrigin, { params })).status).toBe(403);
    mocks.getProjectAccess.mockResolvedValueOnce({
      role: "viewer",
      project: { id: "project-1", userId: "owner-1" },
    });
    expect((await POST(post({ step: "goal" }), { params })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
