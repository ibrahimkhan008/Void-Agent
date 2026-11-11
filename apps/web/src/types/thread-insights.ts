export type ThreadInsights = {
  summary: string;
  decisions: string[];
  actionItems: string[];
};

export type StoredThreadInsights = ThreadInsights & {
  generatedAt: Date | string | null;
  sourceMessageCount: number;
  sourceLastMessageId: string | null;
  currentMessageCount: number;
  currentLastMessageId: string | null;
};
