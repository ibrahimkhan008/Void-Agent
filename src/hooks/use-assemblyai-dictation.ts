"use client";

import {
  buildAssemblyAIStreamingUrl,
  float32ToPcm16,
  readFinalAssemblyAITranscript,
  resampleFloat32,
} from "lib/voice/assemblyai-stream";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

export function useAssemblyAIDictation(onTranscript: (text: string) => void) {
  const [isStarting, setIsStarting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const tokenAbortRef = useRef<AbortController | null>(null);
  const lastTurnOrderRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    activeRef.current = false;
    tokenAbortRef.current?.abort();
    tokenAbortRef.current = null;
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({ type: "Terminate" }));
        } catch {
          // The connection may already be closing.
        }
      }
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      )
        socket.close();
    }
    lastTurnOrderRef.current = null;
    setIsStarting(false);
    setIsListening(false);
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    cleanup();
  }, [cleanup]);

  const start = useCallback(async () => {
    if (activeRef.current || isStarting || isListening) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      toast.error(
        "Microphone dictation requires a supported browser over HTTPS.",
      );
      return;
    }
    activeRef.current = true;
    const generation = ++generationRef.current;
    const cancelled = () => generation !== generationRef.current;
    setIsStarting(true);
    lastTurnOrderRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          noiseSuppression: true,
          echoCancellation: true,
        },
      });
      streamRef.current = stream;
      if (cancelled()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const abort = new AbortController();
      tokenAbortRef.current = abort;
      const tokenResponse = await fetch("/api/assemblyai/token", {
        method: "POST",
        signal: abort.signal,
      });
      const tokenBody = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || typeof tokenBody.token !== "string") {
        throw new Error(
          typeof tokenBody.error === "string"
            ? tokenBody.error
            : "Voice service unavailable",
        );
      }
      if (cancelled()) return;

      const socket = new WebSocket(
        buildAssemblyAIStreamingUrl(tokenBody.token),
      );
      socketRef.current = socket;
      socket.onmessage = (event) => {
        const transcript = readFinalAssemblyAITranscript(event.data);
        if (!transcript) return;
        if (
          transcript.turnOrder !== undefined &&
          transcript.turnOrder === lastTurnOrderRef.current
        )
          return;
        if (transcript.turnOrder !== undefined)
          lastTurnOrderRef.current = transcript.turnOrder;
        callbackRef.current(transcript.text);
      };
      socket.onerror = () => {
        if (!cancelled()) {
          toast.error("Voice connection failed.");
          stop();
        }
      };
      socket.onclose = () => {
        if (!cancelled() && socketRef.current === socket) stop();
      };
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
          socket.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          socket.removeEventListener("open", onOpen);
          reject(new Error("Could not connect to voice service"));
        };
        socket.addEventListener("open", onOpen, { once: true });
        socket.addEventListener("error", onError, { once: true });
      });
      if (cancelled()) return;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        const output = event.outputBuffer.getChannelData(0);
        output.fill(0);
        if (socket.readyState !== WebSocket.OPEN) return;
        const microphone = event.inputBuffer.getChannelData(0);
        socket.send(
          float32ToPcm16(resampleFloat32(microphone, audioContext.sampleRate)),
        );
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      setIsStarting(false);
      setIsListening(true);
    } catch (error) {
      if (!cancelled()) {
        cleanup();
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not start dictation.",
          );
        }
      }
    }
  }, [cleanup, isListening, isStarting, stop]);

  return { isStarting, isListening, start, stop };
}
