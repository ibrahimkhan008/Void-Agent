import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  session,
  selectById,
  selectStructure,
  save,
  remove,
  sameOrigin,
  rateLimit,
  canEdit,
  canDelete,
} = vi.hoisted(() => ({
  session: vi.fn(),
  selectById: vi.fn(),
  selectStructure: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  sameOrigin: vi.fn(),
  rateLimit: vi.fn(),
  canEdit: vi.fn(),
  canDelete: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: session }));
vi.mock("lib/db/repository", () => ({
  workflowRepository: {
    selectById,
    selectStructureById: selectStructure,
    save,
    delete: remove,
  },
}));
vi.mock("lib/security/same-origin", () => ({ hasSameOrigin: sameOrigin }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: rateLimit,
}));
vi.mock("lib/auth/permissions", () => ({
  canEditWorkflow: canEdit,
  canDeleteWorkflow: canDelete,
}));

import { DELETE, GET, PATCH } from "./route";
const id = "6f2e8d72-9709-4d7c-a2ec-55aa564631a0";
const params = Promise.resolve({ id });
const request = (body: unknown) =>
  new Request(`http://local/api/saved-workflows/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "http://local" },
    body: JSON.stringify(body),
  });

describe("saved workflow item routes", () => {
  beforeEach(() => {
    session.mockReset();
    selectById.mockReset();
    selectStructure.mockReset();
    save.mockReset();
    remove.mockReset();
    sameOrigin.mockReset();
    rateLimit.mockReset();
    canEdit.mockReset();
    canDelete.mockReset();
    session.mockResolvedValue({ user: { id: "owner" } });
    selectById.mockResolvedValue({ id, userId: "owner", isPublished: false });
    selectStructure.mockResolvedValue({ id, nodes: [], edges: [] });
    sameOrigin.mockReturnValue(true);
    rateLimit.mockResolvedValue({ allowed: true });
    canEdit.mockResolvedValue(true);
    canDelete.mockResolvedValue(true);
  });
  it("returns a private owner graph", async () => {
    const response = await GET(new Request("http://local"), { params });
    expect(response.status).toBe(200);
    expect(selectStructure).toHaveBeenCalledWith(id);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("hides another owner's workflow and rejects publication fields", async () => {
    selectById.mockResolvedValue({ id, userId: "other", isPublished: false });
    expect((await PATCH(request({ name: "Changed" }), { params })).status).toBe(
      404,
    );
    selectById.mockResolvedValue({ id, userId: "owner", isPublished: false });
    expect(
      (await PATCH(request({ isPublished: true }), { params })).status,
    ).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
  it("updates only bounded draft metadata and refuses published deletion", async () => {
    selectById.mockResolvedValue({
      id,
      userId: "owner",
      name: "Original",
      description: "Existing",
      isPublished: false,
    });
    save.mockResolvedValue({ id, name: "Renamed" });
    expect(
      (
        await PATCH(request({ name: "Renamed", description: "Safe" }), {
          params,
        })
      ).status,
    ).toBe(200);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id, userId: "owner", name: "Renamed" }),
    );
    expect(save.mock.calls[0]?.[0]).toEqual({
      id,
      userId: "owner",
      name: "Renamed",
      description: "Safe",
    });
    selectById.mockResolvedValue({ id, userId: "owner", isPublished: true });
    expect(
      (
        await DELETE(
          new Request(`http://local/api/saved-workflows/${id}`, {
            method: "DELETE",
            headers: { origin: "http://local" },
          }),
          { params },
        )
      ).status,
    ).toBe(409);
    expect(remove).not.toHaveBeenCalled();
  });
});
