import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  metadata: vi.fn(),
  downloadLimited: vi.fn(),
  sameOrigin: vi.fn(),
  transcribe: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({ checkApiRateLimit: mocks.rate }));
vi.mock("lib/security/same-origin", () => ({ hasSameOrigin: mocks.sameOrigin }));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: { getMetadata: mocks.metadata, downloadLimited: mocks.downloadLimited },
}));
vi.mock("lib/file-storage/storage-utils", () => ({
  isUserStorageKey: (key: string, id: string) => key.startsWith(`uploads/${id}/`),
}));
vi.mock("lib/voice/device-audio", () => ({
  MAX_DEVICE_AUDIO_BYTES: 1_000_000,
  isWavAudio: (bytes: Uint8Array) => String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WAVE",
  transcribeDeviceWav: mocks.transcribe,
}));

import { POST } from "./route";

const key = "uploads/user-1/00000000-0000-4000-8000-000000000001-recording.wav";
const wav = Buffer.from("RIFF0000WAVEaudio");
const request = (body: unknown = { key }) => new Request("https://void.test/api/storage/audio/transcribe", {
  method: "POST",
  headers: { Origin: "https://void.test", "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("POST /api/storage/audio/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.metadata.mockResolvedValue({ contentType: "audio/wav", size: wav.byteLength });
    mocks.downloadLimited.mockResolvedValue(wav);
    mocks.transcribe.mockResolvedValue("Meeting at noon");
  });

  it("requires an authenticated same-origin owner and rate allowance", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(401);
    mocks.sameOrigin.mockReturnValue(false);
    expect((await POST(request())).status).toBe(403);
    mocks.sameOrigin.mockReturnValue(true);
    mocks.rate.mockResolvedValue({ allowed: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.metadata).not.toHaveBeenCalled();
  });

  it("rejects foreign, malformed, and non-WAV keys before downloading", async () => {
    expect((await POST(request({ key: "uploads/user-2/recording.wav" }))).status).toBe(404);
    expect((await POST(request({ key, url: "https://attacker.test/audio.wav" }))).status).toBe(400);
    mocks.metadata.mockResolvedValueOnce({ contentType: "audio/mpeg", size: 10 });
    expect((await POST(request())).status).toBe(415);
    expect(mocks.downloadLimited).not.toHaveBeenCalled();
  });

  it("enforces metadata and streamed byte caps and validates WAV content", async () => {
    mocks.metadata.mockResolvedValueOnce({ contentType: "audio/wav", size: 1_000_001 });
    expect((await POST(request())).status).toBe(413);
    mocks.downloadLimited.mockResolvedValueOnce(Buffer.alloc(1_000_001));
    expect((await POST(request())).status).toBe(413);
    mocks.downloadLimited.mockResolvedValueOnce(Buffer.from("not wav"));
    expect((await POST(request())).status).toBe(415);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("returns an ephemeral transcript preview without persistence", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ transcript: "Meeting at noon" });
    expect(mocks.downloadLimited).toHaveBeenCalledWith(key, 1_000_000);
    expect(mocks.transcribe).toHaveBeenCalledWith(wav);
  });

  it("reports no-speech and provider failures without persisting results", async () => {
    mocks.transcribe.mockResolvedValueOnce("");
    expect((await POST(request())).status).toBe(422);
    mocks.transcribe.mockRejectedValueOnce(new Error("provider details"));
    const failed = await POST(request());
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "Audio transcription is temporarily unavailable" });
  });
});
