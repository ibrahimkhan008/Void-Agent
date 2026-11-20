// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/billing/require-credits", () => ({
  requireCredits: () => requireCreditsMock(),
}));

const requireCreditsMock = vi.fn();

// Minimal stand-in for the @elevenlabs/react controller. Status lives outside
// React on purpose: tests move it and rerender, the way the real hook's
// internal setState would.
const scribeState = {
  status: "disconnected" as string,
  error: null as string | null,
};

const connectMock = vi.fn();
const disconnectMock = vi.fn();

let scribeOptions: Record<string, unknown> | null = null;

vi.mock("@elevenlabs/react", () => ({
  CommitStrategy: { MANUAL: "manual", VAD: "vad" },
  useScribe: (options: Record<string, unknown>) => {
    scribeOptions = options;
    return {
      status: scribeState.status,
      error: scribeState.error,
      isConnected: scribeState.status === "connected",
      isTranscribing: scribeState.status === "transcribing",
      connect: connectMock,
      disconnect: disconnectMock,
    };
  },
}));

import { useElevenLabsScribe } from "./use-elevenlabs-scribe";

const fetchMock = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function okTokenResponse() {
  return { ok: true, json: async () => ({ token: "tok" }) };
}

function renderDictation() {
  const onTranscript = vi.fn();
  const onCommand = vi.fn();
  const utils = renderHook(() =>
    useElevenLabsScribe({ onTranscript, onCommand }),
  );
  return { ...utils, onTranscript, onCommand };
}

beforeEach(() => {
  scribeState.status = "disconnected";
  scribeState.error = null;
  connectMock.mockReset();
  disconnectMock.mockReset();
  connectMock.mockImplementation(() => {
    scribeState.status = "connecting";
    return Promise.resolve();
  });
  disconnectMock.mockImplementation(() => {
    scribeState.status = "disconnected";
  });
  requireCreditsMock.mockReset();
  requireCreditsMock.mockReturnValue(true);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => okTokenResponse());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useElevenLabsScribe", () => {
  it("starts a session on first tap and stops fully on the second", async () => {
    const { result, rerender } = renderDictation();

    act(() => {
      result.current.toggleListening();
    });

    await waitFor(() =>
      expect(connectMock).toHaveBeenCalledWith({
        token: "tok",
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      }),
    );
    rerender();
    expect(result.current.isListening).toBe(true);

    act(() => {
      result.current.toggleListening();
    });
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    rerender();
    expect(result.current.isListening).toBe(false);
  });

  it("stops instead of connecting when tapped again while the token is in flight", async () => {
    const token = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    fetchMock.mockImplementation(() => token.promise);

    const { result } = renderDictation();

    act(() => {
      result.current.toggleListening();
    });
    // Second tap lands before the token resolved; connect never ran.
    act(() => {
      result.current.toggleListening();
    });
    expect(disconnectMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      token.resolve(okTokenResponse());
    });

    // The cancelled start must not connect behind the user's back.
    expect(connectMock).not.toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });

  it("does not start when the user is out of credits", () => {
    requireCreditsMock.mockReturnValue(false);
    const { result } = renderDictation();

    act(() => {
      result.current.toggleListening();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("surfaces a sign-in toast on 401 and never connects", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const { result } = renderDictation();
    const { toast } = await import("sonner");

    act(() => {
      result.current.toggleListening();
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Please sign in to use voice dictation",
      ),
    );
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("surfaces an unavailable toast on 503 and never connects", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const { result } = renderDictation();
    const { toast } = await import("sonner");

    act(() => {
      result.current.toggleListening();
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Voice service unavailable"),
    );
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("toasts the mic-permission ladder when connect rejects", async () => {
    connectMock.mockImplementation(() => {
      const error = new Error("Permission denied");
      error.name = "NotAllowedError";
      return Promise.reject(error);
    });
    const { result } = renderDictation();
    const { toast } = await import("sonner");

    act(() => {
      result.current.toggleListening();
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Microphone permission denied. Please allow microphone access.",
      ),
    );
    // The failed start is released so a retry is possible.
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it("forwards committed transcripts to onTranscript", () => {
    const { onTranscript } = renderDictation();

    act(() => {
      (
        scribeOptions?.onCommittedTranscript as (data: {
          text: string;
        }) => void
      )({ text: "  Hallo Welt.  " });
    });

    expect(onTranscript).toHaveBeenCalledWith("Hallo Welt.");
  });

  it("routes send commands to onCommand with the command stripped", () => {
    const { onTranscript, onCommand } = renderDictation();

    act(() => {
      (
        scribeOptions?.onCommittedTranscript as (data: {
          text: string;
        }) => void
      )({ text: "bitte abschicken" });
    });

    expect(onCommand).toHaveBeenCalledWith("bitte");
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("recovers from an error status by toasting once and freeing the session", async () => {
    const { result, rerender } = renderDictation();
    const { toast } = await import("sonner");

    act(() => {
      scribeState.status = "error";
      scribeState.error = "auth_error";
    });
    rerender();

    expect(toast.error).toHaveBeenCalledWith("Voice connection error");
    // The dead connection is released so the button can start again.
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    rerender();
    expect(result.current.isListening).toBe(false);

    // A fresh start must work after the recovery.
    act(() => {
      result.current.toggleListening();
    });
    await waitFor(() => expect(connectMock).toHaveBeenCalled());
  });
});
