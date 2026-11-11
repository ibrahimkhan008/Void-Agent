import { selectThreadWithMessagesAction } from "@/app/api/chat/actions";
import ChatBot from "@/components/chat-bot";
import { ThreadInsightsPanel } from "@/components/chat/thread-insights-panel";
import { pgThreadInsightsRepository } from "@/lib/db/pg/repositories/thread-insights-repository.pg";

import { RedirectType, redirect } from "next/navigation";

export default async function Page({
  params,
}: { params: Promise<{ thread: string }> }) {
  const { thread: threadId } = await params;

  // Loads session, the thread joined with its project name, and the newest
  // message window in a single parallel batch.
  const thread = await selectThreadWithMessagesAction(threadId);

  if (!thread) redirect("/", RedirectType.replace);

  const initialInsights = await pgThreadInsightsRepository.readForOwner(
    threadId,
    thread.userId,
  );

  return (
    <>
      <div className="flex justify-end border-b px-4 py-2">
        <ThreadInsightsPanel threadId={threadId} initial={initialInsights} />
      </div>
      <ChatBot
        threadId={threadId}
        initialMessages={thread.messages}
        projectInfo={thread.projectInfo}
        initialThread={{
          title: thread.title,
          projectId: thread.projectId,
          knowledgeBases: thread.knowledgeBases,
        }}
      />
    </>
  );
}
