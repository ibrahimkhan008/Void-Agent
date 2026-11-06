import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  selectThread: vi.fn(),
  rateLimit: vi.fn(),
  requestStop: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/db/repository", () => ({
  chatRepository: { selectThread: mocks.selectThread },
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/ai/chat-stream-context", () => ({
  requestStop: mocks.requestStop,
}));
import { POST } from "./route";
const threadId = "00000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ id: threadId }) };
const request = (headers = new Headers({ origin: "https://void.test" })) =>
  new Request(`https://void.test/api/chat/${threadId}/stop`, {
    method: "POST",
    headers,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.selectThread.mockResolvedValue({ id: threadId, userId: "user-1" });
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.requestStop.mockResolvedValue(undefined);
});

describe("POST chat stop", () => {
  it("sets the owner-scoped stop flag after same-origin checks", async () => {
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(mocks.requestStop).toHaveBeenCalledWith(threadId);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a generic unavailable response if Redis cannot receive the stop signal", async () => {
    mocks.requestStop.mockRejectedValueOnce(
      new Error("redis connection details"),
    );
    const response = await POST(request(), params);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Could not stop generation");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("denies missing sessions, cross-origin requests, foreign threads and rate-limited calls", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request(), params)).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    expect(
      (
        await POST(
          request(new Headers({ origin: "https://attacker.test" })),
          params,
        )
      ).status,
    ).toBe(403);
    mocks.selectThread.mockResolvedValue({ id: threadId, userId: "user-2" });
    expect((await POST(request(), params)).status).toBe(404);
    mocks.selectThread.mockResolvedValue({ id: threadId, userId: "user-1" });
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    expect((await POST(request(), params)).status).toBe(429);
    expect(mocks.requestStop).not.toHaveBeenCalled();
  });
});
