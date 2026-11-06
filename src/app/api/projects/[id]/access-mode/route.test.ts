import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProjectAccess: vi.fn(),
  update: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/projects/access", () => ({
  getProjectAccess: mocks.getProjectAccess,
}));
vi.mock("lib/db/pg/db.pg", () => ({ pgDb: { update: mocks.update } }));

import { PATCH } from "./route";

function request(body: unknown) {
  return new Request(
    "https://example.test/api/projects/project-1/access-mode",
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://example.test",
      },
      body: JSON.stringify(body),
    },
  );
}

const params = Promise.resolve({ id: "project-1" });

describe("PATCH project access mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "team-owner" } });
    mocks.getProjectAccess.mockResolvedValue({
      role: "owner",
      project: { id: "project-1", teamId: "team-1", accessMode: "team" },
    });
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: async () => [{ id: "project-1", accessMode: "selected" }],
        }),
      }),
    });
  });

  it("lets the team owner opt into selected collaborators", async () => {
    const response = await PATCH(request({ accessMode: "selected" }), {
      params,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      project: { accessMode: "selected" },
    });
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("does not let an editor change project-wide access", async () => {
    mocks.getProjectAccess.mockResolvedValueOnce({
      role: "editor",
      project: { id: "project-1", teamId: "team-1", accessMode: "team" },
    });
    const response = await PATCH(request({ accessMode: "selected" }), {
      params,
    });
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not apply selected-member sharing to personal projects", async () => {
    mocks.getProjectAccess.mockResolvedValueOnce({
      role: "owner",
      project: { id: "project-1", teamId: null, accessMode: "team" },
    });
    const response = await PATCH(request({ accessMode: "selected" }), {
      params,
    });
    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects malformed access mode values", async () => {
    const response = await PATCH(request({ accessMode: "public" }), { params });
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("requires same-origin JSON and rejects malformed or oversized payloads", async () => {
    const url = "https://example.test/api/projects/project-1/access-mode";
    const missingOrigin = new Request(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessMode: "selected" }),
    });
    const crossOrigin = new Request(url, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.test",
      },
      body: JSON.stringify({ accessMode: "selected" }),
    });
    expect((await PATCH(missingOrigin, { params })).status).toBe(403);
    expect((await PATCH(crossOrigin, { params })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();

    const wrongType = new Request(url, {
      method: "PATCH",
      headers: { "content-type": "text/plain", origin: "https://example.test" },
      body: JSON.stringify({ accessMode: "selected" }),
    });
    expect((await PATCH(wrongType, { params })).status).toBe(415);
    const invalidJson = new Request(url, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://example.test",
      },
      body: "{broken",
    });
    expect((await PATCH(invalidJson, { params })).status).toBe(400);
    const oversized = new Request(url, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://example.test",
      },
      body: JSON.stringify({
        accessMode: "selected",
        extra: "x".repeat(5_000),
      }),
    });
    expect((await PATCH(oversized, { params })).status).toBe(413);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
