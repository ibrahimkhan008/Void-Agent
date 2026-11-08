import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  metadata: vi.fn(),
  downloadLimited: vi.fn(),
  sameOrigin: vi.fn(),
  transcribe: vi.fn(),
  isValidAudio: vi.fn(),
  normalizeMime: vi.fn(),
  duration: vi.fn(),
}));

vi.mock("auth/server", () => ({ getSession: mocks.session }));
vi.mock("lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.rate,
}));
vi.mock("lib/security/same-origin", () => ({
  hasSameOrigin: mocks.sameOrigin,
}));
vi.mock("lib/file-storage", () => ({
  serverFileStorage: {
    getMetadata: mocks.metadata,
    downloadLimited: mocks.downloadLimited,
  },
}));
vi.mock("lib/file-storage/storage-utils", () => ({
  isUserStorageKey: (key: string, id: string) =>
    key.startsWith(`uploads/${id}/`),
}));
vi.mock("lib/ai/ingest/audio-format", () => ({
  CHAT_AUDIO_LANGUAGE_CODES: [
    "unknown",
    "as-IN",
    "bn-IN",
    "brx-IN",
    "doi-IN",
    "en-IN",
    "gu-IN",
    "hi-IN",
    "kn-IN",
    "kok-IN",
    "ks-IN",
    "mai-IN",
    "ml-IN",
    "mni-IN",
    "mr-IN",
    "ne-IN",
    "od-IN",
    "pa-IN",
    "sa-IN",
    "sat-IN",
    "sd-IN",
    "ta-IN",
    "te-IN",
    "ur-IN",
  ],
  MAX_CHAT_AUDIO_BYTES: 15 * 1024 * 1024,
  MAX_SYNC_AUDIO_DURATION_SECONDS: 30,
  isValidChatAudioContainer: mocks.isValidAudio,
  normalizeChatAudioMimeType: mocks.normalizeMime,
}));
vi.mock("lib/ai/ingest/uploaded-audio", () => ({
  transcribeUploadedAudio: mocks.transcribe,
}));
vi.mock("lib/ai/ingest/audio-metadata", () => ({
  getChatAudioDurationSeconds: mocks.duration,
}));

import { POST } from "./route";

const key = "uploads/user-1/00000000-0000-4000-8000-000000000001-recording.mp3";
const wav = Buffer.from("RIFF0000WAVEaudio");
const request = (body: unknown = { key }) =>
  new Request("https://void.test/api/storage/audio/transcribe", {
    method: "POST",
    headers: {
      Origin: "https://void.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("POST /api/storage/audio/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.rate.mockResolvedValue({ allowed: true });
    mocks.sameOrigin.mockReturnValue(true);
    mocks.metadata.mockResolvedValue({
      contentType: "audio/mpeg",
      size: wav.byteLength,
    });
    mocks.downloadLimited.mockResolvedValue(wav);
    mocks.normalizeMime.mockImplementation((value: string) =>
      value === "audio/mpeg" ? "audio/mpeg" : null,
    );
    mocks.isValidAudio.mockReturnValue(true);
    mocks.duration.mockResolvedValue(12);
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

  it("rejects foreign, malformed, and unsupported audio types before downloading", async () => {
    expect(
      (await POST(request({ key: "uploads/user-2/recording.wav" }))).status,
    ).toBe(404);
    expect(
      (await POST(request({ key, url: "https://attacker.test/audio.wav" })))
        .status,
    ).toBe(400);
    mocks.metadata.mockResolvedValueOnce({
      contentType: "audio/flac",
      size: 10,
    });
    expect((await POST(request())).status).toBe(415);
    expect(mocks.downloadLimited).not.toHaveBeenCalled();
  });

  it("enforces the 15 MB metadata and streamed byte caps and validates containers", async () => {
    mocks.metadata.mockResolvedValueOnce({
      contentType: "audio/mpeg",
      size: 15 * 1024 * 1024 + 1,
    });
    expect((await POST(request())).status).toBe(413);
    mocks.downloadLimited.mockResolvedValueOnce(
      Buffer.alloc(15 * 1024 * 1024 + 1),
    );
    expect((await POST(request())).status).toBe(413);
    mocks.isValidAudio.mockReturnValueOnce(false);
    mocks.downloadLimited.mockResolvedValueOnce(Buffer.from("not wav"));
    expect((await POST(request())).status).toBe(415);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("returns an ephemeral transcript preview without persistence", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ transcript: "Meeting at noon" });
    expect(mocks.downloadLimited).toHaveBeenCalledWith(key, 15 * 1024 * 1024);
    expect(mocks.transcribe).toHaveBeenCalledWith({
      bytes: wav,
      mimeType: "audio/mpeg",
      filename: expect.stringContaining("recording.mp3"),
      durationSeconds: 12,
      languageCode: "unknown",
      signal: expect.any(AbortSignal),
    });
  });

  it("accepts a documented language hint and rejects unrecognized language codes", async () => {
    const response = await POST(request({ key, languageCode: "hi-IN" }));
    expect(response.status).toBe(200);
    expect(mocks.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ languageCode: "hi-IN" }),
    );

    expect((await POST(request({ key, languageCode: "en-US" }))).status).toBe(
      400,
    );
    expect(mocks.metadata).toHaveBeenCalledTimes(1);
  });

  it("refuses recordings without verified duration or longer than the synchronous limit", async () => {
    mocks.duration.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(422);
    mocks.duration.mockResolvedValueOnce(30.1);
    expect((await POST(request())).status).toBe(413);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("cancels before provider work when the client disconnects during storage read", async () => {
    const canceledRequest = request();
    // Request.signal is read-only, so trigger cancellation from the awaited
    // storage mock via the original request's controller in a new Request.
    const abortController = new AbortController();
    const abortable = new Request(canceledRequest.url, {
      method: "POST",
      headers: canceledRequest.headers,
      body: await canceledRequest.text(),
      signal: abortController.signal,
    });
    mocks.downloadLimited.mockImplementationOnce(async () => {
      abortController.abort();
      return wav;
    });
    expect((await POST(abortable)).status).toBe(499);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("reports no-speech and provider failures without persisting results", async () => {
    mocks.transcribe.mockResolvedValueOnce("");
    expect((await POST(request())).status).toBe(422);
    mocks.transcribe.mockRejectedValueOnce(new Error("provider details"));
    const failed = await POST(request());
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({
      error: "Audio transcription is temporarily unavailable",
    });
  });
});
