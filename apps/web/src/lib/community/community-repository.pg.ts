import type {
  CommunityFeedResponse,
  CommunityFeedTab,
  CommunityPostType,
} from "app-types/community";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { pgDb } from "lib/db/pg/db.pg";
import {
  CommunityMediaTable,
  CommunityPostTable,
  CommunityReactionTable,
} from "lib/db/pg/schema.pg";

const FEED_LIMIT = 100;
const TAG_LIMIT = 8;

export function normalizeCommunityTags(content: string, tags: string[] = []) {
  const extracted = Array.from(
    content.matchAll(/#([a-zA-Z0-9_-]+)/g),
    (match) => match[1].toLowerCase(),
  );
  return Array.from(new Set([...tags, ...extracted]))
    .map((tag) => tag.trim().replace(/^#/, "").slice(0, 40))
    .filter((tag) => /^[a-zA-Z0-9_-]{1,40}$/.test(tag))
    .slice(0, TAG_LIMIT);
}

export const communityRepository = {
  async saveMedia(input: {
    userId: string;
    storageKey: string;
    filename: string;
    contentType: string;
    size: number;
  }) {
    const [row] = await pgDb
      .insert(CommunityMediaTable)
      .values(input)
      .returning({ id: CommunityMediaTable.id });
    return row ?? null;
  },

  async deleteUnattachedMedia(userId: string, id: string) {
    const [row] = await pgDb
      .delete(CommunityMediaTable)
      .where(
        and(
          eq(CommunityMediaTable.id, id),
          eq(CommunityMediaTable.userId, userId),
          isNull(CommunityMediaTable.attachedAt),
        ),
      )
      .returning({ storageKey: CommunityMediaTable.storageKey });
    return row ?? null;
  },

  async createPost(input: {
    authorId: string;
    authorName: string;
    authorAvatar: string | null;
    type: CommunityPostType;
    content: string;
    tags?: string[];
    mediaId?: string;
  }) {
    return pgDb.transaction(async (tx) => {
      if (input.mediaId) {
        const [media] = await tx
          .update(CommunityMediaTable)
          .set({ attachedAt: new Date() })
          .where(
            and(
              eq(CommunityMediaTable.id, input.mediaId),
              eq(CommunityMediaTable.userId, input.authorId),
              isNull(CommunityMediaTable.attachedAt),
            ),
          )
          .returning({ id: CommunityMediaTable.id });
        if (!media) return null;
      }

      const [post] = await tx
        .insert(CommunityPostTable)
        .values({
          authorId: input.authorId,
          authorName: input.authorName.slice(0, 128),
          authorAvatar: input.authorAvatar,
          type: input.mediaId ? "media" : input.type,
          content: input.content.trim(),
          mediaId: input.mediaId ?? null,
          tags: normalizeCommunityTags(input.content, input.tags),
        })
        .returning();
      return post ?? null;
    });
  },

  async listFeed(
    userId: string,
    tab: CommunityFeedTab,
  ): Promise<CommunityFeedResponse> {
    const joined = await pgDb
      .select({ post: CommunityPostTable, media: CommunityMediaTable })
      .from(CommunityPostTable)
      .leftJoin(
        CommunityMediaTable,
        eq(CommunityPostTable.mediaId, CommunityMediaTable.id),
      )
      .orderBy(desc(CommunityPostTable.createdAt), desc(CommunityPostTable.id))
      .limit(FEED_LIMIT);
    const ids = joined.map(({ post }) => post.id);
    const reactions = ids.length
      ? await pgDb
          .select({
            postId: CommunityReactionTable.postId,
            userId: CommunityReactionTable.userId,
            type: CommunityReactionTable.type,
          })
          .from(CommunityReactionTable)
          .where(inArray(CommunityReactionTable.postId, ids))
      : [];
    const counts = new Map<
      string,
      { likes: number; bookmarks: number; liked: boolean; bookmarked: boolean }
    >();
    for (const reaction of reactions) {
      const count = counts.get(reaction.postId) ?? {
        likes: 0,
        bookmarks: 0,
        liked: false,
        bookmarked: false,
      };
      if (reaction.type === "like") {
        count.likes += 1;
        count.liked ||= reaction.userId === userId;
      } else if (reaction.type === "bookmark") {
        count.bookmarks += 1;
        count.bookmarked ||= reaction.userId === userId;
      }
      counts.set(reaction.postId, count);
    }

    const posts = joined.map(({ post, media }) => {
      const reaction = counts.get(post.id);
      return {
        id: post.id,
        author: {
          id: post.authorId,
          name: post.authorName,
          avatar: post.authorAvatar,
        },
        type: post.type as CommunityPostType,
        content: post.content,
        media: media
          ? {
              id: media.id,
              url: `/api/community/media/${media.id}`,
              name: media.filename,
              contentType: media.contentType,
              size: media.size,
            }
          : null,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        likes: reaction?.likes ?? 0,
        comments: 0,
        shares: post.shares,
        tags: post.tags,
        liked: reaction?.liked ?? false,
        bookmarked: reaction?.bookmarked ?? false,
      };
    });
    if (tab === "Trending") {
      posts.sort(
        (a, b) =>
          b.likes * 3 +
            (counts.get(b.id)?.bookmarks ?? 0) * 2 +
            b.shares -
            (a.likes * 3 + (counts.get(a.id)?.bookmarks ?? 0) * 2 + a.shares) ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
    }

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const [aggregate] = await pgDb
      .select({
        members: sql<number>`count(distinct ${CommunityPostTable.authorId})::int`,
        postsToday: sql<number>`count(*) filter (where ${CommunityPostTable.createdAt} >= ${today})::int`,
        activeNow: sql<number>`count(distinct ${CommunityPostTable.authorId}) filter (where ${CommunityPostTable.updatedAt} >= ${new Date(now.getTime() - 15 * 60_000)})::int`,
      })
      .from(CommunityPostTable);

    const tagCounts = new Map<string, number>();
    const contributors = new Map<
      string,
      { id: string; name: string; avatar: string | null; points: number }
    >();
    for (const post of posts) {
      for (const tag of post.tags)
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      const contributor = contributors.get(post.author.id) ?? {
        id: post.author.id,
        name: post.author.name,
        avatar: post.author.avatar,
        points: 0,
      };
      contributor.points += 1 + post.likes + post.shares;
      contributors.set(post.author.id, contributor);
    }

    return {
      posts,
      stats: {
        members: Number(aggregate?.members ?? 0),
        postsToday: Number(aggregate?.postsToday ?? 0),
        activeNow: Number(aggregate?.activeNow ?? 0),
      },
      trendingTopics: [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => ({ tag, count })),
      topContributors: [...contributors.values()]
        .sort((a, b) => b.points - a.points)
        .slice(0, 5),
    };
  },

  async setReaction(input: {
    postId: string;
    userId: string;
    type: "like" | "bookmark";
    active: boolean;
  }) {
    const [post] = await pgDb
      .select({ id: CommunityPostTable.id })
      .from(CommunityPostTable)
      .where(eq(CommunityPostTable.id, input.postId))
      .limit(1);
    if (!post) return false;

    if (input.active) {
      await pgDb
        .insert(CommunityReactionTable)
        .values(input)
        .onConflictDoNothing();
    } else {
      await pgDb
        .delete(CommunityReactionTable)
        .where(
          and(
            eq(CommunityReactionTable.postId, input.postId),
            eq(CommunityReactionTable.userId, input.userId),
            eq(CommunityReactionTable.type, input.type),
          ),
        );
    }
    return true;
  },

  async incrementShare(postId: string) {
    const [row] = await pgDb
      .update(CommunityPostTable)
      .set({
        shares: sql`${CommunityPostTable.shares} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(CommunityPostTable.id, postId))
      .returning({ id: CommunityPostTable.id });
    return !!row;
  },

  async getAttachedMedia(id: string) {
    const [row] = await pgDb
      .select({
        key: CommunityMediaTable.storageKey,
        filename: CommunityMediaTable.filename,
        contentType: CommunityMediaTable.contentType,
        size: CommunityMediaTable.size,
      })
      .from(CommunityMediaTable)
      .innerJoin(
        CommunityPostTable,
        eq(CommunityPostTable.mediaId, CommunityMediaTable.id),
      )
      .where(eq(CommunityMediaTable.id, id))
      .limit(1);
    return row ?? null;
  },
};
