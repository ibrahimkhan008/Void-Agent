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

import {
  decodeVoiceDeviceSessionCursor,
  encodeVoiceDeviceSessionCursor,
} from "lib/voice/device-session-cursor";
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
      limit: 21,
      cursor: undefined,
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
      limit: 8,
      cursor: undefined,
    });
  });

  it("rejects limits above the endpoint bound before reading sessions", async () => {
    const response = await GET(request("?limit=51"), {
      params: Promise.resolve({ id: deviceId }),
    });
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns a stable cursor for the next owner-scoped page", async () => {
    mocks.list.mockResolvedValueOnce([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sessionId: "session-newer",
        status: "completed",
        segmentCount: 1,
        startedAt: new Date("2026-11-07T12:00:00Z"),
        cursorStartedAt: "2026-11-07T12:00:00.000123Z",
        lastSegmentAt: null,
        finalizedAt: null,
        transcript: "newest",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        sessionId: "session-cursor",
        status: "completed",
        segmentCount: 1,
        startedAt: new Date("2026-11-07T11:59:00Z"),
        cursorStartedAt: "2026-11-07T11:59:00.000456Z",
        lastSegmentAt: null,
        finalizedAt: null,
        transcript: "cursor row",
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        sessionId: "session-sentinel",
        status: "completed",
        segmentCount: 1,
        startedAt: new Date("2026-11-07T11:58:00Z"),
        cursorStartedAt: "2026-11-07T11:58:00.000789Z",
        lastSegmentAt: null,
        finalizedAt: null,
        transcript: "sentinel",
      },
    ]);
    const response = await GET(request("?limit=2"), {
      params: Promise.resolve({ id: deviceId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[1].transcript).toBe("cursor row");
    expect(body.items[1]).not.toHaveProperty("cursorStartedAt");
    expect(decodeVoiceDeviceSessionCursor(body.nextCursor)).toEqual({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      startedAt: "2026-11-07T11:59:00.000456Z",
    });
    expect(mocks.list).toHaveBeenCalledWith({
      deviceId,
      userId: "owner-1",
      limit: 3,
      cursor: undefined,
    });

    const nextCursor = encodeVoiceDeviceSessionCursor({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      startedAt: "2026-11-07T11:59:00.000456Z",
    });
    mocks.list.mockResolvedValueOnce([]);
    const nextResponse = await GET(request(`?limit=2&cursor=${nextCursor}`), {
      params: Promise.resolve({ id: deviceId }),
    });
    expect(nextResponse.status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({
      deviceId,
      userId: "owner-1",
      limit: 3,
      cursor: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        startedAt: "2026-11-07T11:59:00.000456Z",
      },
    });
    expect((await nextResponse.json()).nextCursor).toBeNull();
  });

  it("rejects malformed cursors before reading sessions", async () => {
    const response = await GET(request("?cursor=not-a-cursor"), {
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
