import { z } from "zod";

export const CONVERSATION_ARCHIVE_FORMAT = "void-agent-conversation";
export const CONVERSATION_ARCHIVE_VERSION = 1;
export const MAX_CONVERSATION_ARCHIVE_BYTES = 2 * 1024 * 1024;
export const MAX_CONVERSATION_ARCHIVE_MESSAGES = 1_000;
export const MAX_CONVERSATION_ARCHIVE_MESSAGE_CHARS = 40_000;

export const conversationArchiveSchema = z
  .object({
    format: z.literal(CONVERSATION_ARCHIVE_FORMAT),
    version: z.literal(CONVERSATION_ARCHIVE_VERSION),
    exportedAt: z.string().datetime(),
    title: z.string().trim().min(1).max(200),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            text: z.string().min(1).max(MAX_CONVERSATION_ARCHIVE_MESSAGE_CHARS),
          })
          .strict(),
      )
      .max(MAX_CONVERSATION_ARCHIVE_MESSAGES),
  })
  .strict();

export type ConversationArchive = z.infer<typeof conversationArchiveSchema>;
