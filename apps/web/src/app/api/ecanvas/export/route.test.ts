import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "owner-1" } } as any,
  list: vi.fn(),
  insert: vi.fn(),
  checkApiRateLimit: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: () => mocks.session }));
vi.mock("lib/db/pg/repositories/canvas-export-repository.pg", () => ({
  pgCanvasExportRepository: {
    selectSummaryByExporterId: (...args: unknown[]) => mocks.list(...args),
    insert: (...args: unknown[]) => mocks.insert(...args),
  },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: (...args: unknown[]) => mocks.checkApiRateLimit(...args),
}));

import { GET, POST } from "./route";

const payload = {
  canvasId: "canvas-1",
  title: "Landing page",
  html: "<!doctype html><p>Hello</p>",
  scene: { elements: [{ id: "element-1" }] },
  metadata: { providerName: "test" },
};

function request(body: unknown = payload, origin = "https://void-agent.test") {
  return new Request("https://void-agent.test/api/ecanvas/export", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { user: { id: "owner-1" } };
  mocks.list.mockResolvedValue([
    { id: "export-1", title: "Landing page", canvasId: "canvas-1" },
  ]);
  mocks.insert.mockResolvedValue("217c9e15-a2d5-4e68-9d2a-16bc1532ff56");
  mocks.checkApiRateLimit.mockResolvedValue({ allowed: true });
});

describe("GET /api/ecanvas/export", () => {
  it("requires a session and lists only the current user's export summaries", async () => {
    mocks.session = null;
    expect((await GET()).status).toBe(401);
    mocks.session = { user: { id: "owner-1" } };
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.list).toHaveBeenCalledWith("owner-1");
    expect(await response.json()).toEqual({
      exports: [
        { id: "export-1", title: "Landing page", canvasId: "canvas-1" },
      ],
    });
  });
});

describe("POST /api/ecanvas/export", () => {
  it("requires authenticated same-origin input and scopes the insert to the session owner", async () => {
    mocks.session = null;
    expect((await POST(request())).status).toBe(401);
    mocks.session = { user: { id: "owner-1" } };
    expect((await POST(request(payload, "https://attacker.test"))).status).toBe(
      403,
    );
    expect(mocks.insert).not.toHaveBeenCalled();

    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "217c9e15-a2d5-4e68-9d2a-16bc1532ff56",
      url: "/ecanvas/export/217c9e15-a2d5-4e68-9d2a-16bc1532ff56",
    });
    expect(mocks.insert).toHaveBeenCalledWith({
      exporterId: "owner-1",
      ...payload,
    });
  });

  it("rejects oversized HTML, schema extensions and invalid JSON before persistence", async () => {
    expect(
      (await POST(request({ ...payload, html: "x".repeat(512 * 1024 + 1) })))
        .status,
    ).toBe(400);
    expect(
      (await POST(request({ ...payload, exporterId: "attacker" }))).status,
    ).toBe(400);
    const malformed = new Request(
      "https://void-agent.test/api/ecanvas/export",
      {
        method: "POST",
        headers: {
          origin: "https://void-agent.test",
          "content-type": "application/json",
        },
        body: "{",
      },
    );
    expect((await POST(malformed)).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("honors per-user creation rate limits", async () => {
    mocks.checkApiRateLimit.mockResolvedValue({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
