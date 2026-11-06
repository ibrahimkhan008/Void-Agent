import { selectThreadWithMessagesAction } from "@/app/api/chat/actions";
import ChatBot from "@/components/chat-bot";
import { CHAT_MESSAGE_WINDOW } from "lib/const";

import { ChatMessage, ChatThread } from "app-types/chat";
import { RedirectType, redirect } from "next/navigation";

const fetchThread = async (
  threadId: string,
): Promise<(ChatThread & { messages: ChatMessage[] }) | null> => {
  return await selectThreadWithMessagesAction(threadId);
};

export default async function Page({
  params,
}: { params: Promise<{ thread: string }> }) {
  const { thread: threadId } = await params;

  const thread = await fetchThread(threadId);

  if (!thread) redirect("/", RedirectType.replace);

  const initialInsights = thread.summary
    ? {
        summary: thread.summary,
        decisions: thread.decisions ?? [],
        actionItems: thread.actionItems ?? [],
        generatedAt:
          thread.insightsGeneratedAt instanceof Date
            ? thread.insightsGeneratedAt.toISOString()
            : (thread.insightsGeneratedAt ?? null),
      }
    : null;

  return (
    <ChatBot
      key={threadId}
      threadId={threadId}
      initialMessages={thread.messages}
      initialHasMoreMessages={thread.messages.length === CHAT_MESSAGE_WINDOW}
      parentThreadId={thread.parentThreadId ?? null}
      initialCollectionIds={thread.collectionIds ?? null}
      initialProjectId={thread.projectId ?? null}
      initialInsights={initialInsights}
    />
  );
}
