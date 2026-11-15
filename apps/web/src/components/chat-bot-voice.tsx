"use client";

import { appStore } from "@/app/store";
import { useGlobalShortcut } from "@/hooks/use-global-shortcut";
import { requireCredits } from "@/lib/billing/require-credits";
import { Shortcuts, isShortcutEvent } from "lib/keyboard-shortcuts";
import { isNull } from "lib/utils";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useShallow } from "zustand/shallow";

const VoiceChatSession = dynamic(
  () => import("./chat-bot-voice-session").then((mod) => mod.VoiceChatSession),
  { ssr: false },
);

/**
 * Lightweight shell: keyboard shortcut + lazy-loaded realtime session.
 * Heavy deps (@ai-sdk/react realtime) load only when voice chat opens.
 */
export function ChatBotVoice() {
  const [isOpen, agentId, appStoreMutate] = appStore(
    useShallow((state) => [
      state.voiceChat.isOpen,
      state.voiceChat.agentId,
      state.mutate,
    ]),
  );

  useEffect(() => {
    if (!isOpen && !isNull(agentId)) {
      appStoreMutate((prev) => ({
        voiceChat: {
          ...prev.voiceChat,
          agentId: undefined,
        },
      }));
    }
  }, [isOpen, agentId, appStoreMutate]);

  useGlobalShortcut(
    (e: KeyboardEvent) => {
      if (isOpen) return;
      const isVoiceChatEvent = isShortcutEvent(e, Shortcuts.toggleVoiceChat);
      if (isVoiceChatEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (!requireCredits()) return;
        appStoreMutate((prev) => ({
          voiceChat: {
            ...prev.voiceChat,
            isOpen: true,
            agentId: undefined,
          },
        }));
      }
    },
    [isOpen, appStoreMutate],
  );

  if (!isOpen) return null;

  return <VoiceChatSession />;
}
