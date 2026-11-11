/**
 * Return the durable thread URL only after the first request produced a usable
 * streaming response. A failed first send must remain on the draft route so the
 * existing optimistic message can be retried without navigating to a thread
 * that may not exist.
 */
export function getSuccessfulNewChatPath({
  pathname,
  threadId,
  responseOk,
  isNewChat,
}: {
  pathname: string;
  threadId: string;
  responseOk: boolean;
  isNewChat: boolean;
}): string | null {
  const threadPath = `/chat/${encodeURIComponent(threadId)}`;
  if (!responseOk || !isNewChat || pathname === threadPath) return null;
  return threadPath;
}
