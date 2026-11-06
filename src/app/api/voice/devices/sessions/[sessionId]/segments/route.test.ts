import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rate: vi.fn(),
  body: vi.fn(),
  append: vi.fn(),
}));
vi.mock("lib/voice/device-auth", () => ({
  authenticateVoiceDevice: mocks.auth,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/voice/session-thread-contract", () => ({
  readVoiceJsonBody: mocks.body,
}));
vi.mock("lib/db/pg/repositories/voice-device-repository.pg", () => ({
  voiceDeviceRepository: { appendTranscriptSegment: mocks.append },
}));
import { POST } from "./route";

const request = () =>
  new Request(
    "https://void.test/api/voice/devices/sessions/session-1/segments",
    {
      method: "POST",
      headers: {
        authorization: "Bearer device",
        "content-type": "application/json",
      },
    },
  );
const params = { params: Promise.resolve({ sessionId: "session-1" }) };

describe("POST voice transcript segment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: "device-1", userId: "user-1" });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.body.mockResolvedValue({
      ok: true,
      value: { eventId: "event-1", sequenceNumber: 0, text: "Hello" },
    });
    mocks.append.mockResolvedValue({
      accepted: true,
      replay: false,
      segmentCount: 1,
    });
  });

  it("accepts a bounded segment and reports idempotent replay state", async () => {
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      replay: false,
      segmentCount: 1,
    });
    expect(mocks.append).toHaveBeenCalledWith(
      { id: "device-1", userId: "user-1" },
      "session-1",
      expect.objectContaining({ sequenceNumber: 0 }),
    );
  });

  it("maps missing, closed and conflicting events without leaking details", async () => {
    mocks.append.mockResolvedValueOnce({ missing: true });
    expect((await POST(request(), params)).status).toBe(404);
    mocks.append.mockResolvedValueOnce({ closed: true });
    expect((await POST(request(), params)).status).toBe(409);
    mocks.append.mockResolvedValueOnce({ conflict: true });
    expect((await POST(request(), params)).status).toBe(409);
  });
});
