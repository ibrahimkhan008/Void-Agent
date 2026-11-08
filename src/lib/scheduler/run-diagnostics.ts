export type ScheduledRunFailureDiagnostic = {
  code:
    | "authentication"
    | "authorization"
    | "rate-limited"
    | "request-rejected"
    | "service-error"
    | "worker-interrupted"
    | "unknown";
  message: string;
};

/** Convert internal run errors to safe user-facing diagnostics without exposing provider text. */
export function getScheduledRunFailureDiagnostic(
  error: string | null | undefined,
): ScheduledRunFailureDiagnostic | null {
  if (!error) return null;

  if (
    /not replayed after (?:the )?worker lease|worker lease expired/i.test(error)
  ) {
    return {
      code: "worker-interrupted",
      message: "The worker stopped during this run. Queue a new run to retry.",
    };
  }

  const chatStatus = /^chat-api-(\d{3})(?::|$)/.exec(error);
  if (chatStatus) {
    const status = Number(chatStatus[1]);
    if (status === 401) {
      return {
        code: "authentication",
        message: "The scheduler could not authenticate this run.",
      };
    }
    if (status === 403) {
      return {
        code: "authorization",
        message: "The scheduler is not authorized to start this run.",
      };
    }
    if (status === 429) {
      return {
        code: "rate-limited",
        message: "The chat service rate-limited this run. Try again later.",
      };
    }
    if (status >= 500) {
      return {
        code: "service-error",
        message: "The chat service failed while starting this run.",
      };
    }
    return {
      code: "request-rejected",
      message: "The chat service rejected this scheduled run.",
    };
  }

  return {
    code: "unknown",
    message: "This run failed. Check the scheduler configuration and retry.",
  };
}
