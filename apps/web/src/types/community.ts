export const COMMUNITY_POST_TYPES = ["text", "media", "research"] as const;
export type CommunityPostType = (typeof COMMUNITY_POST_TYPES)[number];

export const COMMUNITY_TABS = [
  "For You",
  "Trending",
  "Latest",
  "Following",
] as const;
export type CommunityFeedTab = (typeof COMMUNITY_TABS)[number];

export type CommunityMedia = {
  id: string;
  url: string;
  name: string;
  contentType: string;
  size: number;
};

export type CommunityPost = {
  id: string;
  author: { id: string; name: string; avatar: string | null };
  type: CommunityPostType;
  content: string;
  media: CommunityMedia | null;
  createdAt: string;
  updatedAt: string;
  likes: number;
  comments: number;
  shares: number;
  tags: string[];
  liked: boolean;
  bookmarked: boolean;
};

export type CommunityFeedResponse = {
  posts: CommunityPost[];
  stats: { members: number; postsToday: number; activeNow: number };
  trendingTopics: Array<{ tag: string; count: number }>;
  topContributors: Array<{
    id: string;
    name: string;
    avatar: string | null;
    points: number;
  }>;
};
