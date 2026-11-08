import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioAttachmentTranscription } from "./audio-attachment-transcription";

vi.mock("ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", props, props.children),
}));

const attachmentUrl =
  "https://storage.example.test/uploads/user-1/00000000-0000-4000-8000-000000000001-voice.mp3";

describe("AudioAttachmentTranscription", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("plays the owner-scoped upload and previews its ephemeral transcript", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ transcript: "Remember to send the notes." }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <AudioAttachmentTranscription url={attachmentUrl} />,
    );

    const player = container.querySelector("audio");
    expect(player).not.toBeNull();
    expect(player?.controls).toBe(true);
    expect(player?.src).toContain("/api/storage/download?");

    fireEvent.change(
      screen.getByRole("combobox", { name: "Transcription language" }),
      {
        target: { value: "hi-IN" },
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Transcribe audio" }));
    await screen.findByText("Remember to send the notes.");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/storage/audio/transcribe",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({
          key: "uploads/user-1/00000000-0000-4000-8000-000000000001-voice.mp3",
          languageCode: "hi-IN",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    await waitFor(() => expect(screen.getByText(/Preview only/)).toBeTruthy());
  });

  it("does not offer a player or transcribe for an untrusted external URL", () => {
    const { container } = render(
      <AudioAttachmentTranscription url="https://external.test/audio.mp3" />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
