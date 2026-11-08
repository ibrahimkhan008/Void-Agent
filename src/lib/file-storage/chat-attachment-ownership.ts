import type { ChatAttachment } from "app-types/chat";
import {
  isManagedStorageKey,
  isUserStorageKey,
  storageKeyFromUrl,
} from "./storage-utils";

const INLINE_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,/i;

export function filterUserOwnedChatAttachments(
  attachments: ChatAttachment[],
  userId: string,
) {
  return attachments.filter((attachment) => {
    const key = storageKeyFromUrl(attachment.url);
    if (key && isManagedStorageKey(key)) {
      return isUserStorageKey(key, userId);
    }
    if (attachment.type === "file") {
      return INLINE_IMAGE_DATA_URL.test(attachment.url);
    }
    return true;
  });
}

export function sanitizeChatMessageParts<T>(parts: T[], userId: string): T[] {
  return parts.map((part) => {
    if (!part || typeof part !== "object") return part;
    const candidate = part as { type?: unknown; url?: unknown };
    if (
      (candidate.type !== "file" && candidate.type !== "source-url") ||
      typeof candidate.url !== "string"
    ) {
      return part;
    }

    const key = storageKeyFromUrl(candidate.url);
    if (
      (key && isManagedStorageKey(key) && !isUserStorageKey(key, userId)) ||
      (candidate.type === "file" &&
        !key &&
        !INLINE_IMAGE_DATA_URL.test(candidate.url))
    ) {
      return {
        type: "text",
        text: "[Attached file was not processed because its storage owner could not be verified.]",
      } as T;
    }
    return part;
  });
}
