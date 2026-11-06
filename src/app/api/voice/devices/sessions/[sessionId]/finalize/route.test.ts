import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rate: vi.fn(),
  finalize: vi.fn(),
  persist: vi.fn(),
}));
vi.mock("lib/voice/device-auth", () => ({
  authenticateVoiceDevice: mocks.auth,
}));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/db/pg/repositories/voice-device-repository.pg", () => ({
  voiceDeviceRepository: { finalizeTranscriptSession: mocks.finalize },
}));
vi.mock("lib/voice/device-transcript-store", () => ({
  persistVoiceDeviceTranscript: mocks.persist,
}));
import { POST } from "./route";

const request = () =>
  new Request(
    "https://void.test/api/voice/devices/sessions/session-1/finalize",
    { method: "POST", headers: { authorization: "Bearer device" } },
  );
const params = { params: Promise.resolve({ sessionId: "session-1" }) };

describe("POST voice device session finalize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: "device-1", userId: "user-1" });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.finalize.mockResolvedValue({
      missing: false,
      status: "completed",
      transcript: "Turn on the lights",
      segmentCount: 2,
    });
    mocks.persist.mockResolvedValue({
      forbidden: false,
      threadId: "thread-1",
      messageId: "message-1",
    });
  });

  it("stores the bounded completed transcript in owner chat for review", async () => {
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      action: "saved_for_review",
      threadId: "thread-1",
      segmentCount: 2,
    });
    expect(mocks.persist).toHaveBeenCalledWith(
      { id: "device-1", userId: "user-1" },
      {
        sessionId: "session-1",
        eventId: "session-final",
        text: "Turn on the lights",
      },
    );
  });

  it("does not create a chat message for empty sessions", async () => {
    mocks.finalize.mockResolvedValueOnce({
      missing: false,
      status: "completed",
      transcript: "",
      segmentCount: 0,
    });
    expect((await POST(request(), params)).status).toBe(200);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
