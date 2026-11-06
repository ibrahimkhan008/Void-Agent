import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rate: vi.fn(),
  body: vi.fn(),
  start: vi.fn(),
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
  voiceDeviceRepository: { startTranscriptSession: mocks.start },
}));
import { POST } from "./route";

const request = () =>
  new Request("https://void.test/api/voice/devices/sessions", {
    method: "POST",
    headers: {
      authorization: "Bearer device",
      "content-type": "application/json",
    },
  });

describe("POST voice device session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: "device-1", userId: "user-1" });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.body.mockResolvedValue({
      ok: true,
      value: { sessionId: "session-1" },
    });
    mocks.start.mockResolvedValue({ status: "active", segmentCount: 0 });
  });

  it("creates an owner-bound session idempotently and returns no-store", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      ok: true,
      sessionId: "session-1",
      status: "active",
    });
    expect(mocks.start).toHaveBeenCalledWith(
      { id: "device-1", userId: "user-1" },
      "session-1",
    );
  });

  it("requires an enrolled device and rate limit before persistence", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
