import type { ChatThread } from "app-types/chat";

/** Return a 403 before loading or mutating messages for a foreign thread. */
export function getChatThreadOwnershipError(
  thread: Pick<ChatThread, "userId">,
  requestUserId: string,
): Response | null {
  return thread.userId === requestUserId
    ? null
    : new Response("Forbidden", { status: 403 });
}

/** Map an atomic message claim conflict to a stable client-visible 409. */
export function getChatRunConflictResponse(error: unknown): Response | null {
  if (
    !(error instanceof Error) ||
    (error.name !== "ChatMessageRunConflictError" &&
      error.name !== "ChatMessageIdCollisionError")
  ) {
    return null;
  }

  return Response.json(
    {
      code: "duplicate_message",
      message:
        "This message is already being processed or has already completed.",
      retryable: false,
    },
    { status: 409 },
  );
}
