import ExportError from "@/components/export/error";
import { loadPublicChatExport } from "@/lib/chat/load-public-export";
import { chatExportRepository } from "lib/db/repository";
import ChatPreview from "@/components/export/chat-preview";
import { getUserId } from "@/app/api/chat/actions";
import { Metadata } from "next";
import { getBaseUrl } from "lib/const";

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const thread = await loadPublicChatExport(id);

  if (!thread) {
    return {
      title: "Chat Not Found | Void-Agent",
      description: "This exported chat does not exist or has been removed.",
      robots: { index: false, follow: false },
      referrer: "no-referrer",
    };
  }

  const title = thread.title || "Shared Chat";
  const authorName = thread.exporterName || "Anonymous";
  const description = `${title} - Shared by ${authorName} on Void-Agent`;
  const baseUrl = getBaseUrl();
  const ogImageUrl = `${baseUrl}/api/export/${id}/og-image`;

  return {
    title: `${title} | Void-Agent`,
    description,
    authors: [{ name: authorName }],
    openGraph: {
      title: `${title}`,
      description: `Shared by ${authorName} on Void-Agent`,
      type: "article",
      url: `${baseUrl}/export/${id}`,
      siteName: "Void-Agent",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title}`,
      description: `Shared by ${authorName} on Void-Agent`,
      images: [ogImageUrl],
    },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function ExportPage({ params }: Props) {
  const { id } = await params;
  const thread = await loadPublicChatExport(id);
  if (!thread) {
    return (
      <ExportError message="This export does not exist or has been removed" />
    );
  }
  const isExpired = await chatExportRepository.isExpired(thread.id);
  if (isExpired) {
    return <ExportError message="This export has expired" />;
  }

  const userId = await getUserId().catch(() => undefined);

  const comments =
    thread.allowComments && userId
      ? await chatExportRepository.selectCommentsByExportId(id, userId)
      : [];

  return (
    <ChatPreview
      thread={{
        id: thread.allowComments ? thread.id : "",
        title: thread.title,
        messages: thread.messages,
        exportedAt: thread.exportedAt,
        exporterName: thread.exporterName,
        exporterImage: thread.exporterImage,
      }}
      comments={comments}
      allowComments={thread.allowComments}
    />
  );
}
