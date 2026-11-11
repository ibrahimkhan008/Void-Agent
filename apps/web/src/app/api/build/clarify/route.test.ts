import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "owner" } } as { user: { id: string } } | null,
  clarify: vi.fn(),
  rate: vi.fn(),
  sameOrigin: vi.fn(),
}));
type Session = { user: { id: string } };
type Handler = (request: Request, session: Session) => Promise<Response>;
vi.mock("auth/route-guard", () => ({
  withAuth: (handler: Handler) => async (request: Request) => {
    if (!mocks.session)
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    return handler(request, mocks.session);
  },
}));
vi.mock("lib/ai/app-builder", () => ({
  clarifyAppPrompt: mocks.clarify,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/logger", () => ({ default: { error: vi.fn() } }));

import { POST } from "./route";

const request = (body: unknown) =>
  new Request("https://app.test/api/build/clarify", {
    method: "POST",
    headers: { origin: "https://app.test", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/build/clarify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "owner" } };
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.clarify.mockResolvedValue({
      readyToBuild: false,
      questions: ["Should data persist?"],
      assumptions: ["Single user"],
    });
  });

  it("requires authentication and same-origin", async () => {
    mocks.session = null;
    expect((await POST(request({ prompt: "a timer" }) as never)).status).toBe(
      401,
    );
    mocks.session = { user: { id: "owner" } };
    mocks.sameOrigin.mockReturnValue(false);
    expect((await POST(request({ prompt: "a timer" }) as never)).status).toBe(
      403,
    );
  });

  it("rejects invalid bodies", async () => {
    expect((await POST(request({}) as never)).status).toBe(400);
    expect((await POST(request({ prompt: "" }) as never)).status).toBe(400);
    expect(
      (await POST(request({ prompt: "x".repeat(4001) }) as never)).status,
    ).toBe(400);
    expect(mocks.clarify).not.toHaveBeenCalled();
  });

  it("rate limits the text-only pre-flight", async () => {
    mocks.rate.mockResolvedValue({ allowed: false });
    expect((await POST(request({ prompt: "a timer" }) as never)).status).toBe(
      429,
    );
    mocks.rate.mockResolvedValue(null);
    expect((await POST(request({ prompt: "a timer" }) as never)).status).toBe(
      503,
    );
    expect(mocks.clarify).not.toHaveBeenCalled();
  });

  it("returns the clarifier verdict without creating a sandbox", async () => {
    const response = await POST(
      request({ prompt: "a habit tracker" }) as never,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      readyToBuild: false,
      questions: ["Should data persist?"],
      assumptions: ["Single user"],
    });
    expect(mocks.clarify).toHaveBeenCalledWith(
      "a habit tracker",
      expect.any(AbortSignal),
    );
  });
});
