import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "owner-1" } } as any,
  selectByIdPublic: vi.fn(),
  revokeById: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: () => mocks.session }));
vi.mock("lib/db/pg/repositories/canvas-export-repository.pg", () => ({
  pgCanvasExportRepository: {
    selectByIdPublic: (...args: unknown[]) => mocks.selectByIdPublic(...args),
    revokeById: (...args: unknown[]) => mocks.revokeById(...args),
  },
}));

import { DELETE, GET } from "./route";

const id = "217c9e15-a2d5-4e68-9d2a-16bc1532ff56";
const context = { params: Promise.resolve({ id }) };
const request = (origin = "https://voidagent.test") =>
  new Request(`https://voidagent.test/api/ecanvas/export/${id}`, {
    method: "DELETE",
    headers: { origin },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { user: { id: "owner-1" } };
  mocks.selectByIdPublic.mockResolvedValue({
    id,
    title: "Public canvas",
    html: "<main>Hello</main>",
    canvasId: "canvas-1",
    createdAt: new Date("2026-11-09T00:00:00.000Z"),
    metadata: {},
    exporterName: "Owner",
    exporterImage: null,
  });
  mocks.revokeById.mockResolvedValue(true);
});

describe("GET /api/ecanvas/export/[id]", () => {
  it("returns public export data without owner credentials", async () => {
    const response = await GET(new Request("https://voidagent.test"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ id, title: "Public canvas" });
    expect(mocks.selectByIdPublic).toHaveBeenCalledWith(id);
  });

  it("returns not found for invalid or revoked exports", async () => {
    expect(
      (
        await GET(new Request("https://voidagent.test"), {
          params: Promise.resolve({ id: "not-a-uuid" }),
        })
      ).status,
    ).toBe(404);
    mocks.selectByIdPublic.mockResolvedValue(null);
    expect(
      (await GET(new Request("https://voidagent.test"), context)).status,
    ).toBe(404);
  });
});

describe("DELETE /api/ecanvas/export/[id]", () => {
  it("requires authentication and same origin, then atomically revokes by owner", async () => {
    mocks.session = null;
    expect((await DELETE(request(), context)).status).toBe(401);
    mocks.session = { user: { id: "owner-1" } };
    expect(
      (await DELETE(request("https://attacker.test"), context)).status,
    ).toBe(403);
    expect(mocks.revokeById).not.toHaveBeenCalled();

    const response = await DELETE(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.revokeById).toHaveBeenCalledWith(id, "owner-1");
  });

  it("does not reveal an export owned by another user", async () => {
    mocks.revokeById.mockResolvedValue(false);
    const response = await DELETE(request(), context);
    expect(response.status).toBe(404);
  });
});
