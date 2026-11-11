import type { ChatMetadata } from "app-types/chat";
import { persistFailedChatRun } from "./persist-failed-chat-run";

/**
 * Retry only terminal database writes with the already generated output. The
 * caller must keep message IDs stable so an upsert retry is idempotent. Model
 * generation and tool execution are never repeated here.
 */
export async function finalizeChatRunWithRecovery(params: {
  metadata: ChatMetadata;
  finalize: () => Promise<unknown>;
  persistFailure: (metadata: ChatMetadata) => Promise<unknown>;
  onFinalizationError: (error: unknown, attempt: number) => void;
  onPersistenceError: (error: unknown) => void;
}): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await params.finalize();
      return true;
    } catch (error) {
      try {
        params.onFinalizationError(error, attempt + 1);
      } catch {
        // Diagnostics must not interrupt the retry path.
      }
    }
  }

  await persistFailedChatRun({
    metadata: params.metadata,
    failure: {
      runStatus: "failed",
      code: "persistence_failed",
      retryable: false,
    },
    persist: params.persistFailure,
    onPersistenceError: params.onPersistenceError,
  });
  return false;
}
