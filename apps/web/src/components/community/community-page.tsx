"use client";

import type {
  CommunityFeedResponse,
  CommunityFeedTab,
  CommunityMedia,
  CommunityPost,
} from "app-types/community";
import { authClient } from "lib/auth/client";
import { Eyebrow } from "@/components/ui/eyebrow";
import { COMMUNITY_MEDIA_MAX_BYTES } from "lib/community/media-validation";
import {
  Bookmark,
  ImagePlus,
  Loader2,
  Send,
  Share2,
  ThumbsUp,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "ui/button";

const tabs: CommunityFeedTab[] = ["For You", "Trending", "Latest", "Following"];
type PendingMedia = CommunityMedia & { previewUrl: string };

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  return payload.error || fallback;
}

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "V";
}

function PostCard({
  post,
  onReaction,
}: {
  post: CommunityPost;
  onReaction: (
    post: CommunityPost,
    action: "like" | "bookmark" | "share",
  ) => void;
}) {
  return (
    <article className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
          {initials(post.author.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{post.author.name}</span>
            <time
              className="text-xs text-muted-foreground"
              dateTime={post.createdAt}
            >
              {new Date(post.createdAt).toLocaleString()}
            </time>
            {post.type === "research" && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                Research
              </span>
            )}
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
            {post.content}
          </p>
          {post.media && (
            <div className="mt-3 overflow-hidden rounded-xl border bg-muted/20">
              {post.media.contentType.startsWith("video/") ? (
                <video
                  className="max-h-[480px] w-full"
                  controls
                  preload="metadata"
                  src={post.media.url}
                />
              ) : (
                <Image
                  unoptimized
                  src={post.media.url}
                  alt={post.media.name}
                  width={1200}
                  height={900}
                  className="max-h-[480px] w-full object-contain"
                />
              )}
            </div>
          )}
          {post.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span className="text-xs text-primary" key={tag}>
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              aria-label={post.liked ? "Unlike post" : "Like post"}
              onClick={() => onReaction(post, "like")}
            >
              <ThumbsUp
                className={`mr-1 size-4 ${post.liked ? "fill-current text-primary" : ""}`}
              />
              {post.likes}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={post.bookmarked ? "Remove bookmark" : "Bookmark post"}
              onClick={() => onReaction(post, "bookmark")}
            >
              <Bookmark
                className={`mr-1 size-4 ${post.bookmarked ? "fill-current text-primary" : ""}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Share post"
              onClick={() => onReaction(post, "share")}
            >
              <Share2 className="mr-1 size-4" />
              {post.shares}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function CommunityPage() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const [tab, setTab] = useState<CommunityFeedTab>("For You");
  const [feed, setFeed] = useState<CommunityFeedResponse>();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [research, setResearch] = useState(false);
  const [media, setMedia] = useState<PendingMedia>();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFeedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const source = new EventSource(
      `/api/community/stream?tab=${encodeURIComponent(tab)}`,
    );
    source.onmessage = (event) => {
      try {
        setFeed(JSON.parse(event.data) as CommunityFeedResponse);
        hasFeedRef.current = true;
        setError(undefined);
        setLoading(false);
      } catch {
        setError("Community feed returned an invalid response");
        setLoading(false);
      }
    };
    source.addEventListener("error", () => {
      if (!hasFeedRef.current)
        setError("Community feed is temporarily unavailable");
      setLoading(false);
    });
    return () => source.close();
  }, [tab, userId]);

  useEffect(() => {
    return () => {
      if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl);
    };
  }, [media?.previewUrl]);

  const removeMedia = useCallback(async () => {
    if (!media) return;
    URL.revokeObjectURL(media.previewUrl);
    setMedia(undefined);
    await fetch(`/api/community/media?id=${encodeURIComponent(media.id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }, [media]);

  const uploadMedia = useCallback(async (file?: File) => {
    if (!file) return;
    setError(undefined);
    if (file.size > COMMUNITY_MEDIA_MAX_BYTES) {
      setError("Media must be 10 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/community/media", {
        method: "POST",
        body: form,
      });
      if (!response.ok)
        throw new Error(await readError(response, "Media upload failed"));
      const payload = (await response.json()) as { media: CommunityMedia };
      setMedia({ ...payload.media, previewUrl: URL.createObjectURL(file) });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Media upload failed",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, []);

  const createPost = useCallback(async () => {
    const text = content.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: research ? "research" : media ? "media" : "text",
          content: text,
          mediaId: media?.id,
        }),
      });
      if (!response.ok)
        throw new Error(await readError(response, "Could not create post"));
      if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl);
      setMedia(undefined);
      setContent("");
      setResearch(false);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create post",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, content, media, research]);

  const react = useCallback(
    async (post: CommunityPost, action: "like" | "bookmark" | "share") => {
      const type = action === "share" ? "share" : action;
      const active =
        action === "like"
          ? !post.liked
          : action === "bookmark"
            ? !post.bookmarked
            : undefined;
      setFeed(
        (current) =>
          current && {
            ...current,
            posts: current.posts.map((item) =>
              item.id !== post.id
                ? item
                : {
                    ...item,
                    ...(action === "like"
                      ? { liked: active, likes: item.likes + (active ? 1 : -1) }
                      : {}),
                    ...(action === "bookmark" ? { bookmarked: active } : {}),
                    ...(action === "share" ? { shares: item.shares + 1 } : {}),
                  },
            ),
          },
      );
      try {
        const response = await fetch(
          `/api/community/posts/${post.id}/reactions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              action === "share" ? { type } : { type, active },
            ),
          },
        );
        if (!response.ok)
          throw new Error(await readError(response, "Could not update post"));
      } catch (reactionError) {
        setError(
          reactionError instanceof Error
            ? reactionError.message
            : "Could not update post",
        );
        const refresh = await fetch(
          `/api/community/feed?tab=${encodeURIComponent(tab)}`,
          { cache: "no-store" },
        ).catch(() => null);
        if (refresh?.ok)
          setFeed((await refresh.json()) as CommunityFeedResponse);
      }
    },
    [tab],
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:py-8">
      {/* Section header: eyebrow → display heading. */}
      <header className="mb-7 space-y-2">
        <Eyebrow>Community</Eyebrow>
        <h1 className="text-3xl font-normal tracking-[-0.03em] text-balance sm:text-4xl">
          Community
        </h1>
        <p className="text-sm text-muted-foreground">
          Share ideas and learn with other Void Agent users.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 space-y-4">
          <div className="rounded-2xl border bg-card p-4">
            <label className="sr-only" htmlFor="community-post">
              Write a community post
            </label>
            <textarea
              id="community-post"
              value={content}
              maxLength={5000}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Share something with the community..."
              className="min-h-24 w-full resize-y bg-transparent text-sm outline-none"
            />
            {media && (
              <div className="my-3 flex items-center gap-3 rounded-xl border p-3">
                {media.contentType.startsWith("video/") ? (
                  <video
                    src={media.previewUrl}
                    className="h-16 w-24 rounded object-cover"
                  />
                ) : (
                  <Image
                    unoptimized
                    src={media.previewUrl}
                    alt="Selected upload preview"
                    width={96}
                    height={64}
                    className="h-16 w-24 rounded object-cover"
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {media.name}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove uploaded media"
                  onClick={() => void removeMedia()}
                >
                  <X className="size-4" />
                </Button>
              </div>
            )}
            {error && (
              <p role="alert" className="my-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  className="hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                  onChange={(event) =>
                    void uploadMedia(event.target.files?.[0])
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={uploading || !!media}
                  onClick={() => inputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-2 size-4" />
                  )}
                  Media
                </Button>
                <Button
                  variant={research ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setResearch((value) => !value)}
                >
                  Research
                </Button>
                <span className="text-xs text-muted-foreground">
                  {content.length}/5000
                </span>
              </div>
              <Button
                size="sm"
                disabled={!content.trim() || busy || uploading}
                onClick={() => void createPost()}
              >
                {busy ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Send className="mr-2 size-4" />
                )}
                Post
              </Button>
            </div>
          </div>
          <nav
            aria-label="Community feed"
            className="flex w-fit flex-wrap gap-1 rounded-full border bg-muted/50 p-1"
          >
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                aria-pressed={tab === item}
                className={`rounded-full px-3 py-1.5 text-sm ${tab === item ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
              >
                {item}
              </button>
            ))}
          </nav>
          {loading && (
            <p className="rounded-xl border p-5 text-sm text-muted-foreground">
              Loading community posts…
            </p>
          )}
          {!loading && error && !feed && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 p-5 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {!loading && feed?.posts.length === 0 && (
            <p className="rounded-xl border p-5 text-sm text-muted-foreground">
              No posts yet. Start the conversation.
            </p>
          )}
          {feed?.posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onReaction={(item, action) => void react(item, action)}
            />
          ))}
        </section>
        <aside className="hidden space-y-4 lg:block">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="mb-4 font-semibold">Community stats</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <b>{feed?.stats.members ?? 0}</b>
                <p className="text-xs text-muted-foreground">Members</p>
              </div>
              <div>
                <b>{feed?.stats.postsToday ?? 0}</b>
                <p className="text-xs text-muted-foreground">Today</p>
              </div>
              <div>
                <b>{feed?.stats.activeNow ?? 0}</b>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">Trending topics</h2>
            {feed?.trendingTopics.length ? (
              feed.trendingTopics.map((topic) => (
                <p key={topic.tag} className="py-1 text-sm">
                  #{topic.tag}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {topic.count}
                  </span>
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Topics appear as people post.
              </p>
            )}
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">Top contributors</h2>
            {feed?.topContributors.map((person) => (
              <p key={person.id} className="flex justify-between py-1 text-sm">
                <span>{person.name}</span>
                <span className="text-muted-foreground">{person.points}</span>
              </p>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
