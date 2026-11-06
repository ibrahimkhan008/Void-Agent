import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), rateLimit: vi.fn(), listHistory: vi.fn() }));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit: mocks.rateLimit }));
vi.mock("lib/db/repository", () => ({ voiceDeviceRepository: { listRecentTranscriptsByDevice: mocks.listHistory } }));

import { GET } from "./route";

const deviceId = "00000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ id: deviceId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.listHistory.mockResolvedValue([{
    id: "event-1", threadId: "thread-1", parts: [{ type: "text", text: "Turn left" }],
    metadata: { language: "en" }, createdAt: new Date("2026-11-06T00:00:00Z"),
  }]);
});

describe("GET voice device history", () => {
  it("returns owner-scoped transcript history with a no-store response", async () => {
    const response = await GET(new Request(`https://void.test/api/voice/devices/${deviceId}/history`), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.listHistory).toHaveBeenCalledWith({ deviceId, userId: "user-1", limit: 20 });
    expect(await response.json()).toMatchObject({ items: [{ id: "event-1", text: "Turn left", language: "en" }] });
  });

  it("rejects unauthenticated, malformed, throttled and out-of-range requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(new Request("https://void.test"), params)).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    expect((await GET(new Request("https://void.test"), { params: Promise.resolve({ id: "bad" }) })).status).toBe(404);
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    expect((await GET(new Request("https://void.test"), params)).status).toBe(429);
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    expect((await GET(new Request(`https://void.test?limit=51`), params)).status).toBe(400);
    expect(mocks.listHistory).not.toHaveBeenCalled();
  });
});
