import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rate: vi.fn(),
  list: vi.fn(),
}));
vi.mock("auth/server", () => ({ getSession: mocks.getSession }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/db/repository", () => ({
  voiceDeviceRepository: { listTranscriptSegmentsByDeviceSession: mocks.list },
}));

import { GET } from "./route";

const deviceId = "11111111-1111-4111-8111-111111111111";
const sessionId = "device-session-1";
const request = () =>
  new Request(
    `https://void.test/api/voice/devices/${deviceId}/sessions/${sessionId}/segments`,
  );
const context = { params: Promise.resolve({ id: deviceId, sessionId }) };

describe("GET owner-scoped device voice segments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.list.mockResolvedValue([
      {
        eventId: "evt-a",
        sequenceNumber: 0,
        text: "First utterance",
        language: "en",
        createdAt: new Date("2026-11-07T12:00:00Z"),
      },
      {
        eventId: "evt-b",
        sequenceNumber: 1,
        text: "Second utterance",
        language: null,
        createdAt: new Date("2026-11-07T12:00:02Z"),
      },
    ]);
  });

  it("returns ordered segment metadata without caching and scopes the lookup to the owner", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.list).toHaveBeenCalledWith({
      deviceId,
      userId: "owner-1",
      sessionId,
    });
    expect(await response.json()).toEqual({
      items: [
        {
          eventId: "evt-a",
          sequenceNumber: 0,
          text: "First utterance",
          language: "en",
          createdAt: "2026-11-07T12:00:00.000Z",
        },
        {
          eventId: "evt-b",
          sequenceNumber: 1,
          text: "Second utterance",
          language: null,
          createdAt: "2026-11-07T12:00:02.000Z",
        },
      ],
      truncated: false,
    });
  });

  it("rejects unauthenticated, malformed, and foreign-device requests", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await GET(request(), context)).status).toBe(401);
    const invalidContext = {
      params: Promise.resolve({ id: "not-a-uuid", sessionId }),
    };
    expect((await GET(request(), invalidContext)).status).toBe(404);
    mocks.list.mockResolvedValueOnce(null);
    expect((await GET(request(), context)).status).toBe(404);
  });

  it("caps returned text and observes the per-user rate limit", async () => {
    mocks.list.mockResolvedValueOnce([
      {
        eventId: "evt-long",
        sequenceNumber: 0,
        text: "x".repeat(30_000),
        language: null,
        createdAt: new Date(),
      },
    ]);
    const result = await (await GET(request(), context)).json();
    expect(result.items[0].text).toHaveLength(24_000);
    expect(result.truncated).toBe(true);
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect((await GET(request(), context)).status).toBe(429);
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });
});
