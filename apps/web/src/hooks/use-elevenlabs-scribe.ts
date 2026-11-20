import { requireCredits } from "@/lib/billing/require-credits";
import { CommitStrategy, useScribe } from "@elevenlabs/react";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

interface UseElevenLabsScribeProps {
  onTranscript: (text: string) => void;
  onCommand: (text: string) => void;
}

/** Bias recognition of the dictation send-commands and product terms. */
const DICTATION_KEYTERMS = [
  "senden",
  "abschicken",
  "nachricht",
  "Keinsaas",
  "Navigator",
  "Workflow",
  "Agent",
  "Projekt",
];

const MICROPHONE_OPTIONS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/**
 * Custom hook for ElevenLabs Scribe streaming speech-to-text
 * Uses secure single-use tokens minted by the server endpoint, so the
 * ELEVENLABS_API_KEY never reaches the browser.
 */
export function useElevenLabsScribe({
  onTranscript,
  onCommand,
}: UseElevenLabsScribeProps) {
  // useScribe registers the callbacks it was given at connect() time, so the
  // consumer callbacks are funneled through refs to stay fresh.
  const onTranscriptRef = useRef(onTranscript);
  const onCommandRef = useRef(onCommand);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onCommandRef.current = onCommand;
  }, [onTranscript, onCommand]);

  // Every start bumps the generation and every stop bumps it again, so a
  // start that is still awaiting the token can tell it was cancelled and
  // must not call connect() behind the user's back.
  const generationRef = useRef(0);
  // Covers the window before connect() runs, while the token is still being
  // fetched: status is only "connecting" once connect() executes, but the
  // second tap must already read as stop.
  const startInFlightRef = useRef(false);

  const scribe = useScribe({
    modelId: "scribe_v3_live",
    // VAD auto-commits each utterance on silence. With the default MANUAL
    // strategy committed transcripts never fire and the session drops.
    commitStrategy: CommitStrategy.VAD,
    keyterms: DICTATION_KEYTERMS,
    // Match the AssemblyAI formatted-turn behaviour: filler words and false
    // starts are kept out of the committed transcript that lands in the chat
    // input.
    noVerbatim: true,
    onCommittedTranscript: ({ text }) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Auto-detect send commands in German, same words and stripping as
      // the AssemblyAI hook this replaces in the composer.
      const lower = trimmed.toLowerCase();
      if (lower.includes("senden") || lower.includes("abschicken")) {
        onCommandRef.current(trimmed.replace(/senden|abschicken/gi, "").trim());
      } else {
        onTranscriptRef.current(trimmed);
      }
    },
  });

  // Latest-ref so the stable callbacks below can reach the current controller.
  const scribeRef = useRef(scribe);
  scribeRef.current = scribe;

  // "connecting" counts as listening so the button already reads "stop" (and
  // can cancel) while the session is still being established, and
  // "transcribing" is an active state too — checking only "connected" would
  // flip the button off mid-session on every VAD commit.
  const isListening =
    scribe.status === "connecting" ||
    scribe.status === "connected" ||
    scribe.status === "transcribing";

  // Every failed session keeps its connection occupied inside useScribe;
  // without a disconnect the next start hits the "Already connected" guard
  // and the mic button stays dead until remount. So on any error status:
  // surface it once, then free the session for the next attempt.
  const prevStatusRef = useRef(scribe.status);
  useEffect(() => {
    const wasError = prevStatusRef.current === "error";
    prevStatusRef.current = scribe.status;
    if (scribe.status !== "error") return;

    if (!wasError) {
      console.error("ElevenLabs dictation error:", scribe.error);
      toast.error("Voice connection error");
    }
    scribe.disconnect();
  }, [scribe.status, scribe.error, scribe.disconnect]);

  /**
   * Fetch single-use token from server endpoint
   */
  const fetchScribeToken = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch("/api/elevenlabs/scribe-token", {
        method: "POST",
      });

      if (!response.ok) {
        if (response.status === 401) {
          toast.error("Please sign in to use voice dictation");
        } else {
          toast.error("Voice service unavailable");
        }
        return null;
      }

      const { token } = (await response.json()) as { token?: string };
      return typeof token === "string" ? token : null;
    } catch (error) {
      console.error("Token fetch error:", error);
      toast.error("Failed to initialize voice service");
      return null;
    }
  }, []);

  const startDictation = useCallback(async () => {
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;
    const generation = ++generationRef.current;
    const isCancelled = () => generation !== generationRef.current;

    try {
      const token = await fetchScribeToken();
      if (isCancelled() || !token) return;

      await scribeRef.current.connect({
        token,
        microphone: MICROPHONE_OPTIONS,
      });
    } catch (error) {
      if (isCancelled()) return;
      console.error("Failed to start recording:", error);

      if (error instanceof Error && error.name === "NotAllowedError") {
        toast.error(
          "Microphone permission denied. Please allow microphone access.",
        );
      } else if (error instanceof Error && error.name === "NotFoundError") {
        toast.error("No microphone was found on this device");
      } else if (error instanceof Error && error.name === "NotReadableError") {
        toast.error(
          "Microphone is already in use by another app. Please close other recording apps and try again.",
        );
      } else {
        toast.error("Could not start voice dictation");
      }

      scribeRef.current.disconnect();
    } finally {
      // Do not clear a newer start's flag: stopping bumps the generation,
      // and a third tap may have started a fresh attempt meanwhile.
      if (generation === generationRef.current) {
        startInFlightRef.current = false;
      }
    }
  }, [fetchScribeToken]);

  const stopRecording = useCallback(() => {
    // Cancels an in-flight start (token fetch) and tears down a live one.
    generationRef.current += 1;
    startInFlightRef.current = false;
    scribeRef.current.disconnect();
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening || startInFlightRef.current) {
      stopRecording();
      return;
    }
    // Only the start branch is gated; stopping must always work.
    if (!requireCredits()) return;
    void startDictation();
  }, [isListening, startDictation, stopRecording]);

  return {
    isListening,
    toggleListening,
    stopRecording,
  };
}
