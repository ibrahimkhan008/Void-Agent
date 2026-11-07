import { UIMessage } from "ai";
import { ChatMention } from "app-types/chat";

export type UIMessageWithCompleted = UIMessage & { completed: boolean };

export interface VoiceChatSession {
  isActive: boolean;
  isListening: boolean;
  isUserSpeaking: boolean;
  isAssistantSpeaking: boolean;
  isLoading: boolean;
  messages: UIMessageWithCompleted[];
  error: Error | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
}

export type VoiceChatOptions = {
  toolMentions?: ChatMention[];
  agentId?: string;
  /** Active main-chat thread used for project-scoped voice tools. */
  threadId?: string | null;
  model?: string;
  voice?: string;
  micSensitivity?: "low_noise" | "balanced" | "soft_voice";
};

export type VoiceChatHook = (props?: {
  [key: string]: any;
}) => VoiceChatSession;

export const DEFAULT_VOICE_TOOLS = [
  {
    type: "function",
    name: "changeBrowserTheme",
    description: "Change the browser theme",
    parameters: {
      type: "object",
      properties: {
        theme: {
          type: "string",
          enum: ["light", "dark"],
        },
      },
      required: ["theme"],
    },
  },
  {
    type: "function",
    name: "endConversation",
    description:
      "End the current voice conversation, similar to hanging up a call. This tool should be invoked when the user clearly expresses a desire to finish, exit, or end the dialogue.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "getProjectStatus",
    description:
      "Get status, accepted tasks, and recent milestones for the project attached to the active chat. This is a read-only action and is only available for project chats.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];
