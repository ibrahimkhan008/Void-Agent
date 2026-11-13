import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-1" } } as any,
  get: vi.fn(),
  set: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: () => mocks.session }));
vi.mock("lib/ecanvas/content-store", () => ({
  MAX_HTML_BYTES: 512 * 1024,
  getCanvasContent: (...args: unknown[]) => mocks.get(...args),
  setCanvasContent: (...args: unknown[]) => mocks.set(...args),
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: (...args: unknown[]) => mocks.rate(...args),
}));

import { GET, POST } from "./route";

const canvasId = "217c9e15-a2d5-4e68-9d2a-16bc1532ff56";
const context = { params: Promise.resolve({ canvasId }) };
const request = (body: unknown, origin = "https://voidagent.test") =>
  new Request(`https://voidagent.test/api/ecanvas/${canvasId}/content`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { user: { id: "user-1" } };
  mocks.get.mockReturnValue("<main>private</main>");
  mocks.set.mockReturnValue(true);
  mocks.rate.mockResolvedValue({ allowed: true });
});

describe("eCanvas temporary content API", () => {
  it("requires a signed-in user and reads only that user's canvas key", async () => {
    mocks.session = null;
    expect(
      (await GET(new Request("https://voidagent.test"), context)).status,
    ).toBe(401);
    mocks.session = { user: { id: "user-1" } };
    const response = await GET(new Request("https://voidagent.test"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.get).toHaveBeenCalledWith("user-1", canvasId);
  });

  it("requires same-origin mutations and stores validated bounded HTML", async () => {
    expect(
      (
        await POST(
          request({ html: "<p>x</p>" }, "https://attacker.test"),
          context,
        )
      ).status,
    ).toBe(403);
    expect((await POST(request({ html: "<p>x</p>" }), context)).status).toBe(
      200,
    );
    expect(mocks.set).toHaveBeenCalledWith("user-1", canvasId, "<p>x</p>");
    expect(
      (await POST(request({ html: "x".repeat(512 * 1024 + 1) }), context))
        .status,
    ).toBe(413);
    expect((await POST(request(null), context)).status).toBe(400);
  });
});
