"use client";

import { useEffect } from "react";
import { create } from "zustand";

export type VoiceLivePhase = "idle" | "connecting" | "connected";

export type VoiceLiveStatus = {
  phase: VoiceLivePhase;
  userSpeaking: boolean;
};

export const VOICE_LIVE_IDLE: VoiceLiveStatus = {
  phase: "idle",
  userSpeaking: false,
};

/**
 * What the mounted voice session is doing, for controls that live outside
 * it (voice controls outside the drawer). Only the mounted session or drawer
 * writes it through `useMirrorVoiceLiveStatus`; nothing
 * is persisted.
 */
export const useVoiceLiveStatus = create<VoiceLiveStatus>(
  () => VOICE_LIVE_IDLE,
);

export function voiceLivePhase(session: {
  isLoading: boolean;
  isActive: boolean;
}): VoiceLivePhase {
  if (session.isActive) return "connected";
  return session.isLoading ? "connecting" : "idle";
}

/** Mirrors a session into `useVoiceLiveStatus`; unmounting resets it. */
export function useMirrorVoiceLiveStatus({
  isLoading,
  isActive,
  isUserSpeaking,
}: {
  isLoading: boolean;
  isActive: boolean;
  isUserSpeaking: boolean;
}) {
  useEffect(() => {
    useVoiceLiveStatus.setState({
      phase: voiceLivePhase({ isLoading, isActive }),
      userSpeaking: isActive && isUserSpeaking,
    });
  }, [isLoading, isActive, isUserSpeaking]);
  useEffect(() => () => useVoiceLiveStatus.setState(VOICE_LIVE_IDLE), []);
}
