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
  voiceDeviceRepository: { listRecentSessionsByDevice: mocks.list },
}));

import { voiceDeviceUuid } from "lib/voice/device-transcript";
import { GET } from "./route";

const deviceId = "11111111-1111-4111-8111-111111111111";

function request(query = "") {
  return new Request(
    `https://void.test/api/voice/devices/${deviceId}/sessions${query}`,
  );
}

describe("GET owner-scoped voice device sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner-1" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.list.mockResolvedValue([
      {
        id: "session-row-1",
        sessionId: "session-1",
        status: "completed",
        segmentCount: 2,
        startedAt: new Date("2026-01-01T00:00:00Z"),
        lastSegmentAt: new Date("2026-01-01T00:01:00Z"),
        finalizedAt: new Date("2026-01-01T00:02:00Z"),
        transcript: "Turn on the lights",
      },
      {
        id: "session-row-2",
        sessionId: "session-2",
        status: "active",
        segmentCount: 1,
        startedAt: new Date("2026-01-01T00:00:00Z"),
        lastSegmentAt: null,
        finalizedAt: null,
        transcript: "unfinished transcript",
      },
      {
        id: "session-row-3",
        sessionId: "session-3",
        status: "completed",
        segmentCount: 0,
        startedAt: new Date("2026-01-01T00:00:00Z"),
        lastSegmentAt: null,
        finalizedAt: new Date("2026-01-01T00:02:00Z"),
        transcript: "",
      },
    ]);
  });

  it("returns a deterministic review target only for finalized transcripts", async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ id: deviceId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.items[0]).toMatchObject({
      sessionId: "session-1",
      transcript: "Turn on the lights",
      finalizedAt: "2026-01-01T00:02:00.000Z",
      threadId: voiceDeviceUuid("voice-device-thread", deviceId, "session-1"),
      messageId: voiceDeviceUuid(
        "voice-device-event",
        deviceId,
        "session-1",
        "session-final",
      ),
    });
    expect(body.items[1]).toMatchObject({ threadId: null, messageId: null });
    expect(body.items[2]).toMatchObject({ threadId: null, messageId: null });
    expect(mocks.list).toHaveBeenCalledWith({
      deviceId,
      userId: "owner-1",
      limit: 20,
    });
  });

  it("does not return session review targets without owner authentication", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const response = await GET(request(), {
      params: Promise.resolve({ id: deviceId }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("passes an explicitly requested bounded page size to the repository", async () => {
    const response = await GET(request("?limit=7"), {
      params: Promise.resolve({ id: deviceId }),
    });
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({
      deviceId,
      userId: "owner-1",
      limit: 7,
    });
  });

  it("rejects limits above the endpoint bound before reading sessions", async () => {
    const response = await GET(request("?limit=51"), {
      params: Promise.resolve({ id: deviceId }),
    });
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("checks rate limits before reading sessions", async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    const response = await GET(request(), {
      params: Promise.resolve({ id: deviceId }),
    });
    expect(response.status).toBe(429);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
