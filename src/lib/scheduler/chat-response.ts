const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_TAIL_CHARS = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export type ScheduledChatOutcome =
  | { success: true; finishReason: "stop" }
  | { success: false; error: string };

type StreamOutcome = {
  finishReason?: string;
  blocked: boolean;
};

/**
 * Consume the loopback chat response without retaining the transcript. A 2xx
 * response is not proof that the agent completed: auth middleware can return
 * an HTML page and a tool loop can finish without producing an answer.
 */
export async function inspectScheduledChatResponse(
  response: Response,
  options: {
    maxBytes?: number;
    maxTailChars?: number;
    timeoutMs?: number;
  } = {},
): Promise<ScheduledChatOutcome> {
  if (response.status >= 300 && response.status < 400) {
    void response.body?.cancel().catch(() => undefined);
    return { success: false, error: "chat-api-redirect" };
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    return { success: false, error: `chat-api-${response.status}` };
  }
  if (
    !(response.headers.get("content-type") ?? "")
      .toLowerCase()
      .includes("text/event-stream")
  ) {
    void response.body?.cancel().catch(() => undefined);
    return { success: false, error: "chat-api-invalid-content-type" };
  }

  const reader = response.body?.getReader();
  if (!reader) return { success: false, error: "chat-stream-missing" };

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxTailChars = options.maxTailChars ?? DEFAULT_MAX_TAIL_CHARS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let tail = "";
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        void reader
          .cancel("scheduled chat stream timed out")
          .catch(() => undefined);
        reject(new Error("chat-stream-timeout"));
      }, timeoutMs);
      timeoutId.unref?.();
    });

    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) {
        if (timedOut) return { success: false, error: "chat-stream-timeout" };
        break;
      }
      if (!value) continue;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        void reader
          .cancel("scheduled chat stream exceeded size limit")
          .catch(() => undefined);
        return { success: false, error: "chat-stream-too-large" };
      }
      tail += decoder.decode(value, { stream: true });
      if (tail.length > maxTailChars) tail = tail.slice(-maxTailChars);
    }
    tail += decoder.decode();
  } catch (error) {
    if (
      timedOut ||
      (error instanceof Error && error.message === "chat-stream-timeout")
    ) {
      return { success: false, error: "chat-stream-timeout" };
    }
    return { success: false, error: "chat-stream-read-failed" };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    reader.releaseLock();
  }

  const outcome = readTerminalOutcome(tail);
  if (!outcome.finishReason) {
    return { success: false, error: "chat-stream-incomplete" };
  }
  if (outcome.blocked) return { success: false, error: "chat-run-blocked" };
  if (outcome.finishReason !== "stop") {
    return {
      success: false,
      error:
        outcome.finishReason === "error"
          ? "chat-run-error"
          : `chat-run-finish-${safeFinishReason(outcome.finishReason)}`,
    };
  }
  return { success: true, finishReason: "stop" };
}

function readTerminalOutcome(sse: string): StreamOutcome {
  let terminal: StreamOutcome | undefined;
  for (const line of sse.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const frame: unknown = JSON.parse(payload);
      if (
        !frame ||
        typeof frame !== "object" ||
        (frame as { type?: unknown }).type !== "finish"
      )
        continue;
      const finish = frame as {
        finishReason?: unknown;
        messageMetadata?: { blocked?: { reason?: unknown } };
      };
      const blockedReason = finish.messageMetadata?.blocked?.reason;
      terminal = {
        finishReason:
          typeof finish.finishReason === "string"
            ? finish.finishReason
            : undefined,
        blocked:
          typeof blockedReason === "string" && blockedReason.trim().length > 0,
      };
    } catch {
      // Ignore non-JSON and incomplete data lines. A missing parseable terminal
      // finish frame below is treated as an incomplete run.
    }
  }
  return terminal ?? { blocked: false };
}

function safeFinishReason(reason: string): string {
  return /^[a-z0-9-]{1,32}$/i.test(reason) ? reason.toLowerCase() : "unknown";
}
