import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), transcribe: vi.fn(), persist: vi.fn() }));
vi.mock("lib/voice/device-auth", () => ({ authenticateVoiceDevice: mocks.auth }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit: mocks.rate }));
vi.mock("lib/voice/device-audio", async (importOriginal) => {
  const original = await importOriginal<typeof import("lib/voice/device-audio")>();
  return { ...original, transcribeDeviceWav: mocks.transcribe };
});
vi.mock("lib/voice/device-transcript-store", () => ({ persistVoiceDeviceTranscript: mocks.persist }));

import { MAX_DEVICE_AUDIO_BYTES } from "lib/voice/device-audio";
import { POST } from "./route";

const audio = (length = 16) => {
  const bytes = new Uint8Array(length);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  return bytes;
};
const request = (body = audio(), contentType = "audio/wav") => new Request("https://local.test/api/voice/audio-command", {
  method: "POST",
  headers: { authorization: "Bearer nvdev_live_valid", "content-type": contentType, "x-voice-session-id": "s1", "x-voice-event-id": "e1" },
  body,
});

describe("POST /api/voice/audio-command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ id: "device-1", userId: "user-1" });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.transcribe.mockResolvedValue("Open my notes");
    mocks.persist.mockResolvedValue({ forbidden: false, threadId: "thread-1", messageId: "message-1" });
  });

  it("transcribes bounded WAV and persists the result for user review", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ transcript: "Open my notes", action: "saved_for_review", threadId: "thread-1" });
    expect(mocks.persist).toHaveBeenCalledWith({ id: "device-1", userId: "user-1" }, expect.objectContaining({ sessionId: "s1", eventId: "e1", text: "Open my notes" }));
  });

  it("requires an active device and rate limit allowance", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    mocks.auth.mockResolvedValue({ id: "device-1", userId: "user-1" });
    mocks.rate.mockResolvedValue({ allowed: false });
    expect((await POST(request())).status).toBe(429);
  });

  it("rejects wrong MIME, invalid event headers, and oversized audio before transcription", async () => {
    expect((await POST(request(audio(), "application/octet-stream"))).status).toBe(415);
    expect((await POST(new Request("https://local.test/api/voice/audio-command", { method: "POST", headers: { authorization: "Bearer nvdev_live_valid", "content-type": "audio/wav" }, body: audio() }))).status).toBe(400);
    expect((await POST(request(audio(MAX_DEVICE_AUDIO_BYTES + 1)))).status).toBe(413);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("keeps transcription failures safe and does not persist", async () => {
    mocks.transcribe.mockRejectedValue(new Error("sensitive provider payload"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("sensitive provider payload");
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
