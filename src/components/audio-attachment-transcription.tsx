"use client";

import { Loader, Mic2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { Button } from "ui/button";

export function AudioAttachmentTranscription({ url }: { url: string }) {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [languageCode, setLanguageCode] = useState("unknown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptionController = useRef<AbortController | null>(null);
  const key = storedAudioKeyFromUrl(url);

  useEffect(() => () => transcriptionController.current?.abort(), []);

  if (!key) return null;

  const transcribe = async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    transcriptionController.current = controller;
    try {
      const response = await fetch("/api/storage/audio/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ key, languageCode }),
        signal: controller.signal,
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Could not transcribe this recording";
        throw new Error(message);
      }
      if (
        typeof result !== "object" ||
        result === null ||
        !("transcript" in result) ||
        typeof result.transcript !== "string"
      ) {
        throw new Error(
          "The transcription service returned an invalid response",
        );
      }
      setTranscript(result.transcript);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not transcribe this recording",
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (transcriptionController.current === controller) {
        transcriptionController.current = null;
      }
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <audio
        controls
        preload="metadata"
        className="w-full"
        src={`/api/storage/download?url=${encodeURIComponent(url)}&disposition=inline`}
        aria-label="Audio attachment preview"
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Transcription language</span>
        <select
          aria-label="Transcription language"
          className="rounded-md border bg-background px-2 py-1 text-foreground"
          value={languageCode}
          onChange={(event) => setLanguageCode(event.currentTarget.value)}
          disabled={loading}
        >
          <option value="unknown">Auto detect</option>
          <option value="as-IN">Assamese</option>
          <option value="bn-IN">Bengali</option>
          <option value="brx-IN">Bodo</option>
          <option value="doi-IN">Dogri</option>
          <option value="en-IN">English</option>
          <option value="gu-IN">Gujarati</option>
          <option value="hi-IN">Hindi</option>
          <option value="kn-IN">Kannada</option>
          <option value="kok-IN">Konkani</option>
          <option value="ks-IN">Kashmiri</option>
          <option value="mai-IN">Maithili</option>
          <option value="ml-IN">Malayalam</option>
          <option value="mni-IN">Manipuri</option>
          <option value="mr-IN">Marathi</option>
          <option value="ne-IN">Nepali</option>
          <option value="od-IN">Odia</option>
          <option value="pa-IN">Punjabi</option>
          <option value="sa-IN">Sanskrit</option>
          <option value="sat-IN">Santali</option>
          <option value="sd-IN">Sindhi</option>
          <option value="ta-IN">Tamil</option>
          <option value="te-IN">Telugu</option>
          <option value="ur-IN">Urdu</option>
        </select>
      </label>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void transcribe()}
        disabled={loading}
      >
        {loading ? (
          <Loader className="mr-2 size-4 animate-spin" />
        ) : (
          <Mic2 className="mr-2 size-4" />
        )}
        {loading
          ? "Transcribing…"
          : transcript
            ? "Transcribe again"
            : "Transcribe audio"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {transcript !== null && (
        <div className="rounded-md border bg-background/70 p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Transcript preview
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">
            {transcript}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Preview only. This transcript is not saved or sent to chat, and no
            actions are run.
          </p>
        </div>
      )}
    </div>
  );
}

function storedAudioKeyFromUrl(rawUrl: string) {
  try {
    const pathname = new URL(rawUrl, "https://void-agent.invalid").pathname;
    const encoded = pathname.startsWith("/api/files/")
      ? pathname.slice("/api/files/".length)
      : pathname.replace(/^\//, "");
    const key = decodeURIComponent(encoded);
    const segments = key.replace(/\\/g, "/").split("/");
    const owner = segments.at(-2) ?? "";
    const filename = segments.at(-1) ?? "";
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(owner) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i.test(
        filename,
      )
    )
      return null;
    if (
      segments.some(
        (segment) => !segment || segment === "." || segment === "..",
      )
    )
      return null;
    return key;
  } catch {
    return null;
  }
}
