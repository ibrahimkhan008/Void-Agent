import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeUploadedAudio } from "./uploaded-audio";

describe("transcribeUploadedAudio", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the verified MIME and safe filename to the configured transcription provider", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: { transcript: "  hello   world " } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const transcript = await transcribeUploadedAudio({
      bytes: Buffer.from("OggSpayload"),
      mimeType: "audio/ogg",
      filename: "../../voice note.ogg",
      durationSeconds: 5,
    });

    expect(transcript).toBe("hello world");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    const uploaded = form.get("file") as File;
    expect(uploaded.name).toBe("voice_note.ogg");
    expect(uploaded.type).toBe("audio/ogg");
    expect(form.get("model")).toBe("saaras:v3");
    expect(form.get("language_code")).toBe("unknown");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("passes a caller-selected Saaras language code to the transcription API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ text: "नमस्ते" }));
    vi.stubGlobal("fetch", fetchMock);

    await transcribeUploadedAudio({
      bytes: Buffer.from("OggSpayload"),
      mimeType: "audio/ogg",
      filename: "voice.ogg",
      durationSeconds: 5,
      languageCode: "hi-IN",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.body as FormData).get("language_code")).toBe("hi-IN");
  });

  it("rejects failed providers without exposing provider response details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("private upstream diagnostics", { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeUploadedAudio({
        bytes: Buffer.from("ID3payload"),
        mimeType: "audio/mpeg",
        filename: "meeting.mp3",
        durationSeconds: 5,
      }),
    ).rejects.toThrow("Audio transcription provider failed");
  });

  it("observes cancellation and rejects unsupported formats, durations, or sizes before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort(new DOMException("Canceled", "AbortError"));

    await expect(
      transcribeUploadedAudio({
        bytes: Buffer.from("OggSpayload"),
        mimeType: "audio/ogg",
        filename: "meeting.ogg",
        durationSeconds: 5,
        signal: controller.signal,
      }),
    ).rejects.toThrow("Canceled");
    await expect(
      transcribeUploadedAudio({
        bytes: Buffer.from("unknown"),
        mimeType: "audio/flac",
        filename: "meeting.flac",
        durationSeconds: 5,
      }),
    ).rejects.toThrow("Audio format or size is not supported");
    await expect(
      transcribeUploadedAudio({
        bytes: Buffer.from("OggSpayload"),
        mimeType: "audio/ogg",
        filename: "meeting.ogg",
        durationSeconds: 31,
      }),
    ).rejects.toThrow("Audio format or size is not supported");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
