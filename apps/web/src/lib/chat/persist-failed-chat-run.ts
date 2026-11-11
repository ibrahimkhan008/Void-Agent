import type { ChatMetadata } from "app-types/chat";

/**
 * Mark a persisted user turn as retryable after generation failure. Provider
 * details are deliberately excluded from persisted metadata and client output.
 */
export async function persistFailedChatRun(params: {
  metadata: ChatMetadata;
  persist: (metadata: ChatMetadata) => Promise<unknown>;
  onPersistenceError: (error: unknown) => void;
  failure?: {
    runStatus: "failed" | "timed_out";
    code: "generation_failed" | "timed_out" | "persistence_failed";
    retryable?: boolean;
  };
}): Promise<ChatMetadata> {
  const failure = params.failure ?? {
    runStatus: "failed" as const,
    code: "generation_failed" as const,
  };
  const failedMetadata: ChatMetadata = {
    ...params.metadata,
    runStatus: failure.runStatus,
    error: { code: failure.code, retryable: failure.retryable ?? true },
  };

  try {
    await params.persist(failedMetadata);
  } catch (error) {
    try {
      params.onPersistenceError(error);
    } catch {
      // Diagnostics must not interrupt the route's error handling.
    }
  }

  return failedMetadata;
}
