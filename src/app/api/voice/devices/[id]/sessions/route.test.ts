import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rateLimit: vi.fn(),
  list: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rateLimit,
}));
vi.mock("lib/db/repository", () => ({
  voiceDeviceRepository: { listRecentSessionsByDevice: mocks.list },
}));

import { GET } from "./route";

const deviceId = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const request = (query = "") =>
  new Request(
    `https://example.test/api/voice/devices/${deviceId}/sessions${query}`,
  );
const context = { params: Promise.resolve({ id: deviceId }) };

describe("GET device voice sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.list.mockResolvedValue([]);
  });

  it("requires an authenticated user and does not query", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request(), context);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("passes the authenticated owner and bounded limit to the repository", async () => {
    mocks.list.mockResolvedValue([
      {
        id: "session-pk",
        sessionId: "s-1",
        status: "completed",
        segmentCount: 1,
        startedAt: new Date("2026-01-01Z"),
        lastSegmentAt: null,
        finalizedAt: new Date("2026-01-01Z"),
        transcript: "hello",
      },
    ]);
    const response = await GET(request("?limit=10"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.list).toHaveBeenCalledWith({
      deviceId,
      userId: "user-1",
      limit: 10,
    });
    const body = await response.json();
    expect(body.items[0]).toMatchObject({
      sessionId: "s-1",
      transcript: "hello",
      finalizedAt: "2026-01-01T00:00:00.000Z",
      threadId: expect.any(String),
    });
    expect(body.items[0].threadId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("does not expose a conversation link before finalization or without transcript", async () => {
    mocks.list.mockResolvedValue([
      {
        id: "active-session",
        sessionId: "active-1",
        status: "active",
        segmentCount: 1,
        startedAt: new Date("2026-01-01Z"),
        lastSegmentAt: null,
        finalizedAt: null,
        transcript: "partial",
      },
      {
        id: "empty-session",
        sessionId: "empty-1",
        status: "completed",
        segmentCount: 0,
        startedAt: new Date("2026-01-01Z"),
        lastSegmentAt: null,
        finalizedAt: new Date("2026-01-01Z"),
        transcript: "",
      },
    ]);
    const response = await GET(request(), context);
    expect(
      (await response.json()).items.map(
        (item: { threadId: string | null }) => item.threadId,
      ),
    ).toEqual([null, null]);
  });

  it("rejects excessive limits and rate limits before reading", async () => {
    expect((await GET(request("?limit=51"), context)).status).toBe(400);
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    expect((await GET(request(), context)).status).toBe(429);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
